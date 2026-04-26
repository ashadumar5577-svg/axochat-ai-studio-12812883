import { corsHeaders, jsonResponse, getUserAndAdmin, getUserTier, tierLimits } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ctx = await getUserAndAdmin(req);
    if ("error" in ctx) return jsonResponse({ error: ctx.error }, ctx.status);
    const { user, admin } = ctx;

    const tier = await getUserTier(admin, user.id);
    const limits = tierLimits(tier);

    const { data: usage } = await admin.rpc("get_sandbox_usage", { _user_id: user.id });
    const week = usage?.[0]?.week_seconds ?? 0;
    const day = usage?.[0]?.day_seconds ?? 0;

    if (week >= limits.weekly) {
      return jsonResponse({ error: "Weekly limit reached", tier, week, limits }, 403);
    }
    if (day >= limits.daily) {
      return jsonResponse({ error: "Daily limit reached", tier, day, limits }, 403);
    }

    const E2B_API_KEY = Deno.env.get("E2B_API_KEY");
    if (!E2B_API_KEY) return jsonResponse({ error: "E2B not configured" }, 500);

    // Create sandbox via E2B REST API
    const resp = await fetch("https://api.e2b.dev/sandboxes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": E2B_API_KEY,
      },
      body: JSON.stringify({
        templateID: "base",
        timeout: 1800, // 30 min auto-kill
        metadata: { userId: user.id, tier },
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      console.error("E2B create failed", resp.status, t);
      return jsonResponse({ error: `E2B: ${t.slice(0, 300)}` }, 500);
    }

    const sb = await resp.json();
    const sandboxId = sb.sandboxID || sb.sandbox_id || sb.id;

    const { data: session, error: insErr } = await admin.from("sandbox_sessions").insert({
      user_id: user.id,
      e2b_sandbox_id: sandboxId,
      tier,
      status: "active",
    }).select().single();
    if (insErr) console.error(insErr);

    return jsonResponse({
      sessionId: session?.id,
      sandboxId,
      tier,
      usage: { week, day },
      limits: { weekly: limits.weekly === Infinity ? null : limits.weekly, daily: limits.daily === Infinity ? null : limits.daily },
    });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
