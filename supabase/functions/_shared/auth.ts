import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function jsonResponse(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });
}

export async function getUserAndAdmin(req: Request) {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return { error: "Missing authorization", status: 401 as const };

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return { error: "Unauthorized", status: 401 as const };

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  return { user, admin, userClient };
}

export async function getUserTier(admin: any, userId: string): Promise<"free" | "premium" | "axo_plus"> {
  const { data } = await admin.from("user_roles").select("role").eq("user_id", userId);
  const roles: string[] = (data ?? []).map((r: any) => r.role);
  if (roles.includes("co_founder") || roles.includes("admin") || roles.includes("special")) return "axo_plus";
  if (roles.includes("premium")) return "premium";
  return "free";
}

export function tierLimits(tier: "free" | "premium" | "axo_plus") {
  if (tier === "axo_plus") return { weekly: Infinity, daily: Infinity };
  if (tier === "premium") return { weekly: Infinity, daily: 2 * 60 * 60 }; // 2h/day
  return { weekly: 20 * 60, daily: Infinity }; // 20 min/week
}
