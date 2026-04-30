import { Sandbox } from "npm:@e2b/code-interpreter@1.5.1";
import { corsHeaders, jsonResponse, getUserAndAdmin, getUserTier, tierLimits } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ctx = await getUserAndAdmin(req);
    if ("error" in ctx) return jsonResponse({ error: ctx.error }, ctx.status);
    const { user, admin } = ctx;

    const { sandboxId, command, asRoot } = await req.json();
    if (!sandboxId || !command) return jsonResponse({ error: "Missing sandboxId or command" }, 400);
    const rawCommand = String(command);
    // Block bare interactive shells (no PTY available)
    if (/^(sudo\s+)?(su|bash|sh|zsh|fish)(\s+(-|--login|-i))?\s*$/.test(rawCommand.trim())) {
      return jsonResponse({ error: "Interactive shells aren't supported. Use 'sudo <cmd>' or toggle root mode (sudo su)." }, 400);
    }

    const { data: session } = await admin.from("sandbox_sessions")
      .select("*").eq("e2b_sandbox_id", sandboxId).eq("user_id", user.id).single();
    if (!session) return jsonResponse({ error: "Sandbox not found" }, 404);

    const tier = await getUserTier(admin, user.id);
    const limits = tierLimits(tier);
    const { data: usage } = await admin.rpc("get_sandbox_usage", { _user_id: user.id });
    const day = usage?.[0]?.day_seconds ?? 0;
    const liveSeconds = Math.max(0, Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000));
    if (day + liveSeconds >= limits.daily) return jsonResponse({ error: "Daily sandbox limit reached. Save your workspace and continue tomorrow or upgrade." }, 403);

    const E2B_API_KEY = Deno.env.get("E2B_API_KEY")!;
    const sbx = await Sandbox.connect(sandboxId, { apiKey: E2B_API_KEY });

    const encoder = new TextEncoder();
    let handle: any = null;
    let aborted = false;

    // When the client disconnects (Ctrl+C), kill the running command on the sandbox.
    req.signal.addEventListener("abort", () => {
      aborted = true;
      try { handle?.kill?.(); } catch { /* ignore */ }
    });

    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: unknown) => {
          try { controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n")); } catch { /* closed */ }
        };
        try {
          // Run as a background handle so we can kill it on client abort.
          handle = await sbx.commands.run(rawCommand, {
            background: true,
            user: asRoot ? "root" : "user",
            timeoutMs: 60 * 60 * 1000, // 1 hour max — like a real VPS shell session
            onStdout: (data: string) => send({ stdout: data }),
            onStderr: (data: string) => send({ stderr: data }),
          });
          await handle.wait();
          if (aborted) send({ stderr: "\n^C\n" });
          send({ done: true });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (aborted || /killed|signal|aborted/i.test(msg)) {
            send({ stderr: "\n^C\n" });
          } else {
            send({ stderr: `\n[error] ${msg}\n` });
          }
          send({ done: true });
        } finally {
          try { controller.close(); } catch { /* ignore */ }
        }
      },
      cancel() {
        aborted = true;
        try { handle?.kill?.(); } catch { /* ignore */ }
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  } catch (e) {
    console.error("sandbox-exec error", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
