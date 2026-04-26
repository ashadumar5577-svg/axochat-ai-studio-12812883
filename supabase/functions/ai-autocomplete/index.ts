import { corsHeaders, jsonResponse, getUserAndAdmin } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ctx = await getUserAndAdmin(req);
    if ("error" in ctx) return jsonResponse({ error: ctx.error }, ctx.status);

    const { prefix, suffix, language } = await req.json();
    if (typeof prefix !== "string") return jsonResponse({ error: "Missing prefix" }, 400);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return jsonResponse({ error: "AI not configured" }, 500);

    const sys = `You are a code completion engine. Given the code BEFORE and AFTER the cursor, return ONLY the text that should be inserted at the cursor. No markdown, no explanation, no fences. Keep completions short (1-30 lines max). Match the surrounding style. Language: ${language || "auto"}.`;

    const userMsg = `<BEFORE_CURSOR>\n${prefix.slice(-2000)}\n</BEFORE_CURSOR>\n<AFTER_CURSOR>\n${(suffix || "").slice(0, 500)}\n</AFTER_CURSOR>\n\nReturn only the insertion text.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [{ role: "system", content: sys }, { role: "user", content: userMsg }],
        stream: false,
      }),
    });

    if (resp.status === 429) return jsonResponse({ error: "Rate limited" }, 429);
    if (resp.status === 402) return jsonResponse({ error: "Out of credits" }, 402);
    if (!resp.ok) {
      const t = await resp.text();
      return jsonResponse({ error: `AI: ${t.slice(0, 200)}` }, 500);
    }

    const j = await resp.json();
    let suggestion: string = j.choices?.[0]?.message?.content ?? "";
    suggestion = suggestion.replace(/^```[a-z]*\n?/i, "").replace(/```\s*$/, "");
    return jsonResponse({ suggestion });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
