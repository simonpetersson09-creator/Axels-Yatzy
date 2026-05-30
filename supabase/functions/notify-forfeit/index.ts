// Sends a "opponent forfeited" push to all other players in a finished game.
// Best-effort: never throws; logs to notification_log with kind='forfeit'.

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
    const { game_id, forfeited_session_id } = await req.json().catch(() => ({}));
    if (!game_id) return json({ error: "game_id required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: game } = await supabase
      .from("games")
      .select("id, status, forfeited_by, round")
      .eq("id", game_id)
      .single();
    if (!game || game.status !== "finished" || !game.forfeited_by) {
      return json({ skipped: "game not in forfeited state" });
    }

    // Recipients = all players whose session is not the one that forfeited
    const { data: players } = await supabase
      .from("game_players")
      .select("session_id, player_name, player_index")
      .eq("game_id", game_id);

    const recipients = (players ?? []).filter(
      (p) => !forfeited_session_id || p.session_id !== forfeited_session_id,
    );

    const results: Array<{ session_id: string; delivered: boolean; reason?: string }> = [];

    for (const r of recipients) {
      const { data: token } = await supabase
        .from("push_tokens")
        .select("device_id, token, platform")
        .eq("session_id", r.session_id)
        .eq("enabled", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Respect turn_notifications preference (forfeit counts as turn-class signal)
      let allowed = true;
      if (token?.device_id) {
        const { data: prefs } = await supabase
          .from("notification_preferences")
          .select("turn_notifications")
          .eq("device_id", token.device_id)
          .maybeSingle();
        if (prefs && prefs.turn_notifications === false) allowed = false;
      }

      const title = "Spelet är slut 🏳️";
      const body = `${game.forfeited_by} gav upp — du vinner!`;

      const { data: logRow, error: insertErr } = await supabase
        .from("notification_log")
        .insert({
          game_id,
          recipient_session_id: r.session_id,
          recipient_device_id: token?.device_id ?? null,
          kind: "forfeit",
          round: game.round,
          player_index: r.player_index,
          delivered: false,
          metadata: { title, body, forfeited_by: game.forfeited_by },
        })
        .select()
        .single();

      if (insertErr) {
        results.push({ session_id: r.session_id, delivered: false, reason: insertErr.message });
        continue;
      }
      if (!allowed) {
        results.push({ session_id: r.session_id, delivered: false, reason: "prefs_off" });
        continue;
      }
      if (!token?.token) {
        results.push({ session_id: r.session_id, delivered: false, reason: "no_token" });
        continue;
      }

      const delivered = await sendApns({
        deviceToken: token.token,
        title,
        body,
        data: { game_id, kind: "forfeit", notification_id: logRow.id },
      });
      if (delivered) {
        await supabase.from("notification_log").update({ delivered: true }).eq("id", logRow.id);
      }
      results.push({ session_id: r.session_id, delivered });
    }

    return json({ success: true, results });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

interface ApnsArgs {
  deviceToken: string;
  title: string;
  body: string;
  data: Record<string, string>;
}

async function sendApns(args: ApnsArgs): Promise<boolean> {
  const keyId = Deno.env.get("APNS_KEY_ID");
  const teamId = Deno.env.get("APNS_TEAM_ID");
  const bundleId = Deno.env.get("APNS_BUNDLE_ID");
  const authKey = Deno.env.get("APNS_AUTH_KEY");
  const env = Deno.env.get("APNS_ENV") ?? "production";

  if (!keyId || !teamId || !bundleId || !authKey) {
    console.log("[apns] secrets missing — skipping push delivery");
    return false;
  }

  try {
    const jwt = await buildApnsJwt({ keyId, teamId, authKey });
    const host = env === "sandbox" ? "api.sandbox.push.apple.com" : "api.push.apple.com";
    const url = `https://${host}/3/device/${args.deviceToken}`;
    const payload = {
      aps: {
        alert: { title: args.title, body: args.body },
        sound: "default",
        "mutable-content": 1,
      },
      ...args.data,
    };
    const res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `bearer ${jwt}`,
        "apns-topic": bundleId,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn("[apns] delivery failed", res.status, text);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[apns] error", err);
    return false;
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
