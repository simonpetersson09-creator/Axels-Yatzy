// Cron-driven: finds multiplayer games where the current player has been inactive
// for 30+ minutes and sends a friendly reminder, throttled to once per 6h per recipient/game.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const INACTIVE_MIN_MINUTES = 30;
const REMINDER_COOLDOWN_HOURS = 6;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: games } = await supabase
      .from("games")
      .select("id, current_player_index, round, status")
      .eq("status", "playing");

    if (!games || games.length === 0) return json({ checked: 0, sent: 0 });

    let sent = 0;
    const cutoff = new Date(Date.now() - INACTIVE_MIN_MINUTES * 60_000).toISOString();
    const cooldown = new Date(Date.now() - REMINDER_COOLDOWN_HOURS * 3_600_000).toISOString();

    for (const game of games) {
      const { data: current } = await supabase
        .from("game_players")
        .select("session_id, player_name, player_index, last_active_at")
        .eq("game_id", game.id)
        .eq("player_index", game.current_player_index)
        .single();
      if (!current) continue;
      if (new Date(current.last_active_at).toISOString() > cutoff) continue;

      // Check cooldown
      const { data: recent } = await supabase
        .from("notification_log")
        .select("id")
        .eq("game_id", game.id)
        .eq("recipient_session_id", current.session_id)
        .eq("kind", "reminder")
        .gte("sent_at", cooldown)
        .limit(1);
      if (recent && recent.length > 0) continue;

      const { data: opp } = await supabase
        .from("game_players")
        .select("player_name")
        .eq("game_id", game.id)
        .neq("player_index", game.current_player_index)
        .order("player_index")
        .limit(1)
        .maybeSingle();
      const opponentName = opp?.player_name ?? "Din motståndare";

      const { data: token } = await supabase
        .from("push_tokens")
        .select("device_id, token, platform")
        .eq("session_id", current.session_id)
        .eq("enabled", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (token?.device_id) {
        const { data: prefs } = await supabase
          .from("notification_preferences")
          .select("reminder_notifications")
          .eq("device_id", token.device_id)
          .maybeSingle();
        if (prefs && prefs.reminder_notifications === false) continue;
      }

      const title = "Din match väntar 👀";
      const body = `${opponentName} väntar på ditt drag`;

      const { data: logRow, error: insertErr } = await supabase
        .from("notification_log")
        .insert({
          game_id: game.id,
          recipient_session_id: current.session_id,
          recipient_device_id: token?.device_id ?? null,
          kind: "reminder",
          round: game.round,
          player_index: game.current_player_index,
          delivered: false,
          metadata: { title, body, opponent_name: opponentName },
        })
        .select()
        .single();
      if (insertErr) continue;

      let delivered = false;
      if (token?.token) {
        delivered = await sendApns({
          deviceToken: token.token,
          title,
          body,
          data: { game_id: game.id, kind: "reminder", notification_id: logRow.id },
        });
        if (delivered) {
          await supabase.from("notification_log").update({ delivered: true }).eq("id", logRow.id);
        }
      }

      await supabase.from("analytics_events").insert({
        event_name: "reminder_notification_sent",
        device_id: token?.device_id ?? null,
        local_user_id: token?.device_id ?? null,
        game_id: game.id,
        game_mode: "multiplayer",
        metadata: { delivered, opponent_name: opponentName },
        platform: token?.platform ?? "server",
        app_version: "1.0.0",
      });

      sent++;
    }

    return json({ checked: games.length, sent });
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
  if (!keyId || !teamId || !bundleId || !authKey) return false;

  try {
    const jwt = await buildApnsJwt({ keyId, teamId, authKey });
    const host = env === "sandbox" ? "api.sandbox.push.apple.com" : "api.push.apple.com";
    const res = await fetch(`https://${host}/3/device/${args.deviceToken}`, {
      method: "POST",
      headers: {
        authorization: `bearer ${jwt}`,
        "apns-topic": bundleId,
        "apns-push-type": "alert",
        "apns-priority": "5",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        aps: { alert: { title: args.title, body: args.body }, sound: "default" },
        ...args.data,
      }),
    });
    if (!res.ok) {
      console.warn("[apns] reminder failed", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[apns] reminder error", err);
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
