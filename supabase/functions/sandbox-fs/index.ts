import { Sandbox } from "npm:@e2b/code-interpreter@1.5.1";
import { corsHeaders, jsonResponse, getUserAndAdmin } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ctx = await getUserAndAdmin(req);
    if ("error" in ctx) return jsonResponse({ error: ctx.error }, ctx.status);
    const { user, admin } = ctx;

    const { sandboxId, action, path, content } = await req.json();
    if (!sandboxId || !action) return jsonResponse({ error: "Missing fields" }, 400);

    const { data: session } = await admin.from("sandbox_sessions")
      .select("*").eq("e2b_sandbox_id", sandboxId).eq("user_id", user.id).single();
    if (!session) return jsonResponse({ error: "Sandbox not found" }, 404);

    const E2B_API_KEY = Deno.env.get("E2B_API_KEY")!;
    const sbx = await Sandbox.connect(sandboxId, { apiKey: E2B_API_KEY });

    if (action === "read") {
      const text = await sbx.files.read(path);
      return jsonResponse({ content: text });
    }
    if (action === "write") {
      await sbx.files.write(path, content ?? "");
      return jsonResponse({ ok: true });
    }
    if (action === "list") {
      const entries = await sbx.files.list(path || "/home/user");
      return jsonResponse({ entries });
    }
    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("sandbox-fs error", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
