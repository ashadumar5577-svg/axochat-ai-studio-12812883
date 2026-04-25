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

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: provider, error: provErr } = await admin
      .from("ai_providers")
      .select("*")
      .eq("id", providerId)
      .eq("enabled", true)
      .single();

    if (provErr || !provider) return json({ error: "Model not found" }, 404);

    const baseUrl = provider.base_url.replace(/\/$/, "");
    // Detect Ollama-style by URL signature, not provider_type (axox can be either)
    const isOllama =
      /\/api\/generate$/.test(baseUrl) ||
      /\/api$/.test(baseUrl) ||
      /:11434(\/|$)/.test(baseUrl);

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (provider.auth_header === "x-api-key") headers["X-API-Key"] = provider.api_key;
    else headers["Authorization"] = `Bearer ${provider.api_key}`;

    let upstreamUrl: string;
    let body: string;

    if (isOllama) {
      // Ollama /api/generate format. Build a prompt from messages.
      upstreamUrl = /\/api\/generate$/.test(baseUrl) ? baseUrl : `${baseUrl}/api/generate`;
      const prompt = messages
        .map((m: any) => {
          const role = m.role === "assistant" ? "Assistant" : m.role === "system" ? "System" : "User";
          return `${role}: ${m.content}`;
        })
        .join("\n\n") + "\n\nAssistant:";
      body = JSON.stringify({ model: provider.model_id, prompt, stream: true });
    } else {
      // OpenAI-compatible /chat/completions
      upstreamUrl = /\/chat\/completions$/.test(baseUrl) ? baseUrl : `${baseUrl}/chat/completions`;
      body = JSON.stringify({
        model: provider.model_id,
        messages: messages.map((m: any) => ({ role: m.role, content: m.content })),
        stream: true,
      });
    }

    const upstream = await fetch(upstreamUrl, { method: "POST", headers, body });

    if (upstream.status === 429) return json({ error: "Rate limited" }, 429);
    if (upstream.status === 402) return json({ error: "Out of credits" }, 402);
    if (!upstream.ok || !upstream.body) {
      const t = await upstream.text();
      console.error("Upstream error", upstream.status, t);
      return json({ error: `Upstream ${upstream.status}: ${t.slice(0, 300)}` }, 500);
    }

    if (!isOllama) {
      // Pass through OpenAI SSE directly
      return new Response(upstream.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // Convert Ollama JSON-lines stream to OpenAI-compatible SSE chunks
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let buf = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            let nl: number;
            while ((nl = buf.indexOf("\n")) !== -1) {
              const line = buf.slice(0, nl).trim();
              buf = buf.slice(nl + 1);
              if (!line) continue;
              try {
                const obj = JSON.parse(line);
                const piece = obj.response ?? "";
                if (piece) {
                  const sse = `data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`;
                  controller.enqueue(encoder.encode(sse));
                }
                if (obj.done) {
                  controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                }
              } catch (e) {
                console.error("ollama parse", e, line.slice(0, 200));
              }
            }
          }
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        } catch (e) {
          console.error("stream error", e);
          controller.error(e);
        }
      },
    });

    return new Response(stream, {
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
