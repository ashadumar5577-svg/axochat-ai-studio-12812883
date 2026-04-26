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
    const base = `https://api.e2b.dev/sandboxes/${sandboxId}/filesystem`;

    if (action === "read") {
      const r = await fetch(`${base}/file?path=${encodeURIComponent(path)}`, {
        headers: { "X-API-Key": E2B_API_KEY },
      });
      if (!r.ok) return jsonResponse({ error: `Read failed: ${r.status}` }, r.status);
      const text = await r.text();
      return jsonResponse({ content: text });
    }

    if (action === "write") {
      const fd = new FormData();
      fd.append("file", new Blob([content ?? ""], { type: "text/plain" }), path.split("/").pop() ?? "file");
      fd.append("path", path);
      const r = await fetch(`${base}/file`, {
        method: "POST",
        headers: { "X-API-Key": E2B_API_KEY },
        body: fd,
      });
      if (!r.ok) {
        const t = await r.text();
        return jsonResponse({ error: `Write failed: ${t.slice(0, 200)}` }, 500);
      }
      return jsonResponse({ ok: true });
    }

    if (action === "list") {
      const r = await fetch(`${base}/list?path=${encodeURIComponent(path || "/home/user")}`, {
        headers: { "X-API-Key": E2B_API_KEY },
      });
      if (!r.ok) return jsonResponse({ entries: [] });
      const j = await r.json();
      return jsonResponse({ entries: j });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
