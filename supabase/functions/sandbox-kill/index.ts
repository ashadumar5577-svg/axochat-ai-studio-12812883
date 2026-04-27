import { Sandbox } from "npm:@e2b/code-interpreter@1.5.1";
import { corsHeaders, jsonResponse, getUserAndAdmin } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ctx = await getUserAndAdmin(req);
    if ("error" in ctx) return jsonResponse({ error: ctx.error }, ctx.status);
    const { user, admin } = ctx;

    const { sandboxId } = await req.json();
    if (!sandboxId) return jsonResponse({ error: "Missing sandboxId" }, 400);

    const { data: session } = await admin.from("sandbox_sessions")
      .select("*").eq("e2b_sandbox_id", sandboxId).eq("user_id", user.id).single();
    if (!session) return jsonResponse({ error: "Sandbox not found" }, 404);

    const E2B_API_KEY = Deno.env.get("E2B_API_KEY")!;
    try {
      const sbx = await Sandbox.connect(sandboxId, { apiKey: E2B_API_KEY });
      await sbx.kill();
    } catch (e) { console.warn("kill warn", e); }

    const startedAt = new Date(session.started_at).getTime();
    const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));

    await admin.from("sandbox_sessions").update({
      ended_at: new Date().toISOString(),
      seconds_used: seconds,
      status: "ended",
    }).eq("id", session.id);

    return jsonResponse({ ok: true, seconds });
  } catch (e) {
    console.error("sandbox-kill error", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
