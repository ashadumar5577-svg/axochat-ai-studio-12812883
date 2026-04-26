import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// GET callback from GitHub: ?code=...&state=<userId>
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state"); // userId
    const returnTo = url.searchParams.get("return_to") || "/ide";
    if (!code || !state) return new Response("Missing code/state", { status: 400 });

    const CLIENT_ID = Deno.env.get("GITHUB_OAUTH_CLIENT_ID")!;
    const CLIENT_SECRET = Deno.env.get("GITHUB_OAUTH_CLIENT_SECRET")!;

    const tokenResp = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code }),
    });
    const tokenJson = await tokenResp.json();
    const accessToken = tokenJson.access_token;
    const scope = tokenJson.scope;
    if (!accessToken) {
      return new Response(`GitHub error: ${JSON.stringify(tokenJson)}`, { status: 400 });
    }

    // Fetch GitHub username
    const userResp = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "AxoX-IDE" },
    });
    const ghUser = await userResp.json();

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await admin.from("github_tokens").upsert({
      user_id: state,
      access_token: accessToken,
      github_username: ghUser.login,
      scope,
    });

    // Redirect back to IDE
    const origin = req.headers.get("origin") || url.origin;
    const redirectUrl = returnTo.startsWith("http") ? returnTo : `${returnTo}?gh=connected`;
    return new Response(null, { status: 302, headers: { Location: redirectUrl } });
  } catch (e) {
    return new Response(`Error: ${e instanceof Error ? e.message : "Unknown"}`, { status: 500 });
  }
});
