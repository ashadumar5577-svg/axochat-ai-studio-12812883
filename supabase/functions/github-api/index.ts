import { corsHeaders, jsonResponse, getUserAndAdmin } from "../_shared/auth.ts";

async function gh(token: string, path: string, init: RequestInit = {}) {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "AxoX-IDE",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ctx = await getUserAndAdmin(req);
    if ("error" in ctx) return jsonResponse({ error: ctx.error }, ctx.status);
    const { user, admin } = ctx;

    const body = await req.json();
    const { action } = body;

    const { data: tok } = await admin.from("github_tokens").select("*").eq("user_id", user.id).single();
    if (!tok && action !== "status") return jsonResponse({ error: "GitHub not connected" }, 401);

    if (action === "status") {
      return jsonResponse({ connected: !!tok, username: tok?.github_username ?? null });
    }

    if (action === "list_repos") {
      const r = await gh(tok.access_token, "/user/repos?per_page=100&sort=updated");
      if (!r.ok) return jsonResponse({ error: `GitHub ${r.status}` }, 500);
      const repos = await r.json();
      return jsonResponse({
        repos: repos.map((x: any) => ({
          full_name: x.full_name, name: x.name, private: x.private,
          default_branch: x.default_branch, html_url: x.html_url,
        })),
      });
    }

    if (action === "list_branches") {
      const r = await gh(tok.access_token, `/repos/${body.repo}/branches?per_page=100`);
      const j = await r.json();
      return jsonResponse({ branches: j });
    }

    if (action === "list_tree") {
      const r = await gh(tok.access_token, `/repos/${body.repo}/git/trees/${body.branch}?recursive=1`);
      const j = await r.json();
      return jsonResponse({ tree: j.tree ?? [] });
    }

    if (action === "read_file") {
      const r = await gh(tok.access_token, `/repos/${body.repo}/contents/${encodeURIComponent(body.path)}?ref=${body.branch}`);
      const j = await r.json();
      const content = j.content ? atob(j.content.replace(/\n/g, "")) : "";
      return jsonResponse({ content, sha: j.sha });
    }

    if (action === "commit_file") {
      // body: repo, branch, path, content, message, sha?
      const enc = btoa(unescape(encodeURIComponent(body.content)));
      const payload: any = {
        message: body.message || "Update via AxoX IDE",
        content: enc,
        branch: body.branch,
      };
      if (body.sha) payload.sha = body.sha;
      const r = await gh(tok.access_token, `/repos/${body.repo}/contents/${encodeURIComponent(body.path)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok) return jsonResponse({ error: j.message || "Commit failed" }, 500);
      return jsonResponse({ ok: true, commit: j.commit });
    }

    if (action === "create_repo") {
      const r = await gh(tok.access_token, "/user/repos", {
        method: "POST",
        body: JSON.stringify({ name: body.name, private: !!body.private, auto_init: true }),
      });
      const j = await r.json();
      if (!r.ok) return jsonResponse({ error: j.message }, 500);
      return jsonResponse({ repo: j });
    }

    if (action === "disconnect") {
      await admin.from("github_tokens").delete().eq("user_id", user.id);
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
