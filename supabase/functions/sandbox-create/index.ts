import { Sandbox } from "npm:@e2b/code-interpreter@1.5.1";
import { corsHeaders, jsonResponse, getUserAndAdmin, getUserTier, tierLimits, tierResources } from "../_shared/auth.ts";

// E2B runs Linux sandboxes with a maximum 1h lifetime per boot. AxoX enforces longer paid quotas by
// allowing users to create fresh 1h sandboxes while keeping their workspace persisted in Lovable Cloud.
const OS_TEMPLATES: Record<string, string> = {
  "ubuntu-22.04": "base",
  "ubuntu-24.04": "base",
  "debian-12": "base",
  "node": "base",
  "python": "base",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ctx = await getUserAndAdmin(req);
    if ("error" in ctx) return jsonResponse({ error: ctx.error }, ctx.status);
    const { user, admin } = ctx;

    let template = "ubuntu-22.04";
    try {
      const body = await req.json();
      if (body?.template && OS_TEMPLATES[body.template]) template = body.template;
    } catch (_) { /* no body */ }

    const tier = await getUserTier(admin, user.id);
    const limits = tierLimits(tier);
    const resources = tierResources(tier);

    const { data: usage } = await admin.rpc("get_sandbox_usage", { _user_id: user.id });
    const week = usage?.[0]?.week_seconds ?? 0;
    const day = usage?.[0]?.day_seconds ?? 0;

    if (week >= limits.weekly) return jsonResponse({ error: "Weekly limit reached", tier, week }, 403);
    if (day >= limits.daily) {
      const hrs = Math.round(limits.daily / 3600);
      return jsonResponse({ error: `Daily limit reached (${hrs}h). Upgrade for more.`, tier, day }, 403);
    }

    const E2B_API_KEY = Deno.env.get("E2B_API_KEY");
    if (!E2B_API_KEY) return jsonResponse({ error: "E2B not configured" }, 500);

    const e2bTemplate = OS_TEMPLATES[template];
    const remainingSeconds = Math.max(60, limits.daily - day);
    const sandboxTimeoutMs = Math.min(remainingSeconds * 1000, 60 * 60 * 1000);

    const sbx = await Sandbox.create(e2bTemplate, {
      apiKey: E2B_API_KEY,
      timeoutMs: sandboxTimeoutMs,
      metadata: { os: template, tier, userId: user.id },
    });
    const sandboxId = sbx.sandboxId;
    const osInfo = template === "debian-12"
      ? { name: "Debian", version: "12 compatible userland" }
      : template === "ubuntu-24.04"
        ? { name: "Ubuntu", version: "24.04 compatible" }
        : { name: "Ubuntu", version: "22.04 LTS compatible" };

    await sbx.commands.run(`mkdir -p /home/user && cat > /home/user/.axox-os <<'EOF'
${osInfo.name} ${osInfo.version}
EOF
cat > /home/user/README.axox.txt <<'EOF'
AxoX IDE Environment
Selected OS: ${osInfo.name} ${osInfo.version}
EOF`, { user: "root", timeoutMs: 10_000 }).catch(console.warn);

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
      template,
      os: osInfo,
      resources,
      usage: { week, day },
      limits: {
        weekly: limits.weekly === Infinity ? null : limits.weekly,
        daily: limits.daily === Infinity ? null : limits.daily,
      },
    });
  } catch (e) {
    console.error("sandbox-create error", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
