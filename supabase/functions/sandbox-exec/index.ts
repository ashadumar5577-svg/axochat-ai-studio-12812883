import { corsHeaders, jsonResponse, getUserAndAdmin } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ctx = await getUserAndAdmin(req);
    if ("error" in ctx) return jsonResponse({ error: ctx.error }, ctx.status);
    const { user, admin } = ctx;

    const { sandboxId, command } = await req.json();
    if (!sandboxId || !command) return jsonResponse({ error: "Missing sandboxId or command" }, 400);

    // Verify sandbox belongs to user
    const { data: session } = await admin.from("sandbox_sessions")
      .select("*").eq("e2b_sandbox_id", sandboxId).eq("user_id", user.id).single();
    if (!session) return jsonResponse({ error: "Sandbox not found" }, 404);

    const E2B_API_KEY = Deno.env.get("E2B_API_KEY")!;

    // Use E2B process API to run command
    const resp = await fetch(`https://api.e2b.dev/sandboxes/${sandboxId}/processes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": E2B_API_KEY },
      body: JSON.stringify({
        cmd: "/bin/bash",
        args: ["-c", command],
        envs: {},
        cwd: "/home/user",
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      return jsonResponse({ error: `E2B exec: ${t.slice(0, 300)}` }, 500);
    }

    // Stream the response back as SSE
    if (!resp.body) return jsonResponse({ error: "No stream" }, 500);

    return new Response(resp.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
