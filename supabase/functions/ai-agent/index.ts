import { Sandbox } from "npm:@e2b/code-interpreter@1.5.1";
import { corsHeaders, jsonResponse, getUserAndAdmin } from "../_shared/auth.ts";

const SYSTEM = `You are AxoX Copilot, an AI coding assistant embedded in the AxoX IDE. The user is working inside an Ubuntu Linux sandbox.

You can help by:
- Explaining and writing code
- Creating files / directories in the sandbox
- Editing existing files
- Running shell commands

Use the provided tools when the user asks you to make changes. Otherwise just chat normally and use markdown. Keep responses concise.`;

type ChatMessage = { role: "system" | "user" | "assistant" | "tool"; content: string; tool_call_id?: string; tool_calls?: any };

const TOOLS = [
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Create or overwrite a file in the sandbox.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute path inside the sandbox, e.g. /home/user/app.py" },
          content: { type: "string", description: "Full file contents." },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a file from the sandbox.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "List files in a directory.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "make_dir",
      description: "Create a directory (mkdir -p).",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Run a shell command in the sandbox and return stdout/stderr.",
      parameters: {
        type: "object",
        properties: { command: { type: "string" } },
        required: ["command"],
        additionalProperties: false,
      },
    },
  },
];

async function callTool(sbx: any, name: string, args: any): Promise<string> {
  try {
    if (name === "write_file") {
      await sbx.files.write(args.path, args.content ?? "");
      return JSON.stringify({ ok: true, path: args.path, bytes: (args.content ?? "").length });
    }
    if (name === "read_file") {
      const content = await sbx.files.read(args.path);
      return JSON.stringify({ ok: true, content: String(content).slice(0, 8000) });
    }
    if (name === "list_dir") {
      const entries = await sbx.files.list(args.path || "/home/user");
      return JSON.stringify({ ok: true, entries });
    }
    if (name === "make_dir") {
      await sbx.commands.run(`mkdir -p ${JSON.stringify(args.path)}`);
      return JSON.stringify({ ok: true, path: args.path });
    }
    if (name === "run_command") {
      const res = await sbx.commands.run(args.command, { timeoutMs: 60_000 });
      return JSON.stringify({
        ok: res.exitCode === 0,
        exitCode: res.exitCode,
        stdout: String(res.stdout ?? "").slice(0, 6000),
        stderr: String(res.stderr ?? "").slice(0, 4000),
      });
    }
    return JSON.stringify({ ok: false, error: `Unknown tool: ${name}` });
  } catch (e) {
    return JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ctx = await getUserAndAdmin(req);
    if ("error" in ctx) return jsonResponse({ error: ctx.error }, ctx.status);
    const { user, admin } = ctx;

    const { messages, sandboxId, model } = await req.json();
    if (!Array.isArray(messages)) return jsonResponse({ error: "messages required" }, 400);

    let sbx: any = null;
    if (sandboxId) {
      const { data: session } = await admin.from("sandbox_sessions")
        .select("*").eq("e2b_sandbox_id", sandboxId).eq("user_id", user.id).single();
      if (session) {
        const E2B_API_KEY = Deno.env.get("E2B_API_KEY")!;
        try { sbx = await Sandbox.connect(sandboxId, { apiKey: E2B_API_KEY }); } catch (e) { console.warn("connect", e); }
      }
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return jsonResponse({ error: "AI not configured" }, 500);

    const convo: ChatMessage[] = [{ role: "system", content: SYSTEM }, ...messages];
    const toolEvents: { name: string; args: any; result: any }[] = [];

    // Agent loop (max 5 tool rounds)
    for (let round = 0; round < 5; round++) {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: model || "google/gemini-3-flash-preview",
          messages: convo,
          tools: sbx ? TOOLS : undefined,
        }),
      });

      if (!resp.ok) {
        if (resp.status === 429) return jsonResponse({ error: "Rate limited, try again soon." }, 429);
        if (resp.status === 402) return jsonResponse({ error: "AI credits exhausted. Add funds in workspace settings." }, 402);
        const t = await resp.text();
        console.error("AI gateway", resp.status, t);
        return jsonResponse({ error: "AI gateway error" }, 500);
      }

      const data = await resp.json();
      const msg = data.choices?.[0]?.message;
      if (!msg) return jsonResponse({ error: "Empty AI response" }, 500);

      const toolCalls = msg.tool_calls;
      if (!toolCalls || toolCalls.length === 0 || !sbx) {
        return jsonResponse({ reply: msg.content || "", toolEvents });
      }

      convo.push({ role: "assistant", content: msg.content || "", tool_calls: toolCalls } as any);

      for (const tc of toolCalls) {
        let args: any = {};
        try { args = JSON.parse(tc.function.arguments || "{}"); } catch { /* ignore */ }
        const result = await callTool(sbx, tc.function.name, args);
        let parsed: any = result;
        try { parsed = JSON.parse(result); } catch { /* keep string */ }
        toolEvents.push({ name: tc.function.name, args, result: parsed });
        convo.push({ role: "tool", tool_call_id: tc.id, content: result });
      }
    }

    return jsonResponse({ reply: "(Reached max tool rounds)", toolEvents });
  } catch (e) {
    console.error("ai-agent error", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
