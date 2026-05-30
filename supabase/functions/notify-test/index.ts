// Diagnostic test-notification: sends an APNs push to the caller's device
// and returns rich debug info so we can see exactly where the chain breaks.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const { device_id, session_id } = await req.json().catch(() => ({}));
    if (!device_id && !session_id) {
      return json({ error: "device_id or session_id required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Find the most recent push token for this device/session
    const query = supabase
      .from("push_tokens")
      .select("device_id, session_id, token, platform, enabled, updated_at")
      .eq("enabled", true)
      .order("updated_at", { ascending: false })
      .limit(1);
    if (device_id) query.eq("device_id", device_id);
    else query.eq("session_id", session_id);
    const { data: token, error: tokenErr } = await query.maybeSingle();

    if (tokenErr) {
      return json({ stage: "lookup_token", error: tokenErr.message }, 200);
    }

    const apnsConfigured = !!(
      Deno.env.get("APNS_KEY_ID") &&
      Deno.env.get("APNS_TEAM_ID") &&
      Deno.env.get("APNS_BUNDLE_ID") &&
      Deno.env.get("APNS_AUTH_KEY")
    );

    if (!token) {
      return json({
        stage: "no_token",
        delivered: false,
        apns_configured: apnsConfigured,
        hint: "Ingen push-token hittades. Öppna appen på din iPhone, godkänn notiser, och försök igen.",
      });
    }

    if (!apnsConfigured) {
      return json({
        stage: "apns_not_configured",
        delivered: false,
        token_found: true,
        token_platform: token.platform,
        token_updated_at: token.updated_at,
        hint: "APNs-secrets saknas i Lovable Cloud. Lägg upp APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID, APNS_AUTH_KEY.",
      });
    }

    const apnsResult = await sendApns({
      deviceToken: token.token,
      title: "Testnotis 🎲",
      body: "Om du ser detta funkar pushkedjan hela vägen.",
      data: { kind: "test" },
    });

    return json({
      stage: "sent",
      delivered: apnsResult.ok,
      apns_status: apnsResult.status,
      apns_reason: apnsResult.reason,
      token_platform: token.platform,
      token_updated_at: token.updated_at,
    });
  } catch (err) {
    return json({ stage: "exception", error: (err as Error).message }, 500);
  }
});

interface ApnsArgs {
  deviceToken: string;
  title: string;
  body: string;
  data: Record<string, string>;
}

async function sendApns(args: ApnsArgs): Promise<{ ok: boolean; status?: number; reason?: string }> {
  const keyId = Deno.env.get("APNS_KEY_ID")!;
  const teamId = Deno.env.get("APNS_TEAM_ID")!;
  const bundleId = Deno.env.get("APNS_BUNDLE_ID")!;
  const authKey = Deno.env.get("APNS_AUTH_KEY")!;
  const env = Deno.env.get("APNS_ENV") ?? "production";

  try {
    const jwt = await buildApnsJwt({ keyId, teamId, authKey });
    const host = env === "sandbox" ? "api.sandbox.push.apple.com" : "api.push.apple.com";
    const res = await fetch(`https://${host}/3/device/${args.deviceToken}`, {
      method: "POST",
      headers: {
        authorization: `bearer ${jwt}`,
        "apns-topic": bundleId,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        aps: { alert: { title: args.title, body: args.body }, sound: "default" },
        ...args.data,
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      return { ok: false, status: res.status, reason: txt };
    }
    await res.text();
    return { ok: true, status: res.status };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

async function buildApnsJwt(args: { keyId: string; teamId: string; authKey: string }): Promise<string> {
  const header = { alg: "ES256", kid: args.keyId };
  const payload = { iss: args.teamId, iat: Math.floor(Date.now() / 1000) };
  const enc = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  const signingInput = `${enc(header)}.${enc(payload)}`;
  const pem = args.authKey.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${signingInput}.${sigB64}`;
}
