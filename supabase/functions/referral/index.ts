// Referral attribution without needing a game code.
// action "click": invite web page records the visitor's (hashed) IP for the inviter's code.
// action "claim": a brand-new install asks the server to match it, either automatically
// (same IP within 2 hours of a click) or manually with the inviter's code.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function hashIp(ip: string): Promise<string> {
  const salt = Deno.env.get("SUPABASE_URL") ?? "salt";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}|${ip}`));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function clientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  const ip = (xff?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "").trim();
  return ip || null;
}

const cleanCode = (c: unknown) =>
  typeof c === "string" ? c.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) : "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (b: object, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const body = await req.json().catch(() => ({}));
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const ip = clientIp(req);

    if (body.action === "click") {
      const code = cleanCode(body.ref);
      if (!code || !ip) return json({ ok: false });
      const ipHash = await hashIp(ip);
      const { data: allowed } = await supabase.rpc("check_rate_limit", { p_key: `refclick:${ipHash}`, p_min_interval_seconds: 5 });
      if (allowed === false) return json({ ok: true });
      const { data: row } = await supabase.from("referral_codes").select("session_id").eq("code", code).maybeSingle();
      if (!row) return json({ ok: false });
      await supabase.from("referral_clicks").insert({ inviter_session_id: row.session_id, ip_hash: ipHash });
      return json({ ok: true });
    }

    if (body.action === "claim") {
      const { session_id, device_id } = body;
      if (typeof session_id !== "string" || typeof device_id !== "string" || device_id.length < 8 || device_id.length > 64) {
        return json({ matched: false }, 400);
      }
      const { data: owns } = await supabase.rpc("claim_session", { p_session_id: session_id, p_device_id: device_id });
      if (owns !== true) return json({ matched: false }, 403);

      const { data: allowed } = await supabase.rpc("check_rate_limit", { p_key: `refclaim:${device_id}`, p_min_interval_seconds: 3 });
      if (allowed === false) return json({ matched: false, error: "rate" }, 429);

      let inviter: string | null = null;
      const code = cleanCode(body.code);
      if (code) {
        const { data: row } = await supabase.from("referral_codes").select("session_id").eq("code", code).maybeSingle();
        if (!row) return json({ matched: false, error: "invalid_code" });
        inviter = row.session_id;
      } else if (ip) {
        const since = new Date(Date.now() - 2 * 3600_000).toISOString();
        const { data: click } = await supabase.from("referral_clicks")
          .select("inviter_session_id").eq("ip_hash", await hashIp(ip)).gte("created_at", since)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        inviter = click?.inviter_session_id ?? null;
      }
      if (!inviter) return json({ matched: false });

      const { data: granted } = await supabase.rpc("internal_grant_referral", { p_invitee: session_id, p_inviter: inviter });
      return json({ matched: granted === true, error: granted === true ? undefined : (code ? "not_eligible" : undefined) });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    console.error("[referral]", e);
    return json({ matched: false }, 500);
  }
});
