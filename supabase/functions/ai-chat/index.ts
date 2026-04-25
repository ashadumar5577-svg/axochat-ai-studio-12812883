import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    const { providerId, messages } = await req.json();
    if (!providerId || !Array.isArray(messages)) return json({ error: "Invalid body" }, 400);

    // Service role to fetch the api key safely
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: provider, error: provErr } = await admin
      .from("ai_providers")
      .select("*")
      .eq("id", providerId)
      .eq("enabled", true)
      .single();

    if (provErr || !provider) return json({ error: "Model not found" }, 404);

    const upstreamUrl = `${provider.base_url.replace(/\/$/, "")}/chat/completions`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (provider.auth_header === "x-api-key") headers["X-API-Key"] = provider.api_key;
    else headers["Authorization"] = `Bearer ${provider.api_key}`;

    const upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: provider.model_id,
        messages: messages.map((m: any) => ({ role: m.role, content: m.content })),
        stream: true,
      }),
    });

    if (upstream.status === 429) return json({ error: "Rate limited" }, 429);
    if (upstream.status === 402) return json({ error: "Out of credits" }, 402);
    if (!upstream.ok) {
      const t = await upstream.text();
      console.error("Upstream error", upstream.status, t);
      return json({ error: `Upstream ${upstream.status}` }, 500);
    }

    return new Response(upstream.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
