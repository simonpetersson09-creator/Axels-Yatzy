// Sends a "your turn" notification to the player whose turn it is in a multiplayer game.
// Idempotent via UNIQUE INDEX on notification_log(game_id, recipient_session_id, round, player_index)
// when kind='turn'. APNs delivery is best-effort; if APNs secrets are absent the notification
// is logged as queued (delivered=false) so analytics still works.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ACTIVE_HEARTBEAT_S = 30; // skip notif if recipient device active within 30s

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const { game_id, sender_device_id } = await req.json().catch(() => ({}));
    if (!game_id) return json({ error: "game_id required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: game, error: gameErr } = await supabase
      .from("games")
      .select("id, status, current_player_index, round")
      .eq("id", game_id)
      .single();
    if (gameErr || !game) return json({ error: "game not found" }, 404);
    if (game.status !== "playing") return json({ skipped: "not playing" });

    const { data: player, error: playerErr } = await supabase
      .from("game_players")
      .select("session_id, player_name, player_index, last_active_at, game_id")
      .eq("game_id", game_id)
      .eq("player_index", game.current_player_index)
      .single();
    if (playerErr || !player) return json({ error: "current player not found" }, 404);

    // Don't notify someone who is actively in the app.
    const lastActive = new Date(player.last_active_at).getTime();
    if (Date.now() - lastActive < ACTIVE_HEARTBEAT_S * 1000) {
      return json({ skipped: "recipient is active" });
    }

    // Find opponent name (first non-current player)
    const { data: others } = await supabase
      .from("game_players")
      .select("player_name, player_index")
      .eq("game_id", game_id)
      .neq("player_index", game.current_player_index)
      .order("player_index")
      .limit(1);
    const opponentName = others?.[0]?.player_name ?? "din motståndare";

    // Look up device + preferences for the recipient
    const { data: token } = await supabase
      .from("push_tokens")
      .select("device_id, token, platform")
      .eq("session_id", player.session_id)
      .eq("enabled", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let allowed = true;
    if (token?.device_id) {
      const { data: prefs } = await supabase
        .from("notification_preferences")
        .select("turn_notifications")
        .eq("device_id", token.device_id)
        .maybeSingle();
      if (prefs && prefs.turn_notifications === false) allowed = false;

      // Don't notify the device that just triggered the turn change
      if (sender_device_id && token.device_id === sender_device_id) {
        return json({ skipped: "sender is recipient" });
      }
    }
    if (!allowed) return json({ skipped: "preferences disabled" });

    const title = "Din tur 🎲";
    const body = `Det är din tur mot ${opponentName}`;

    // Idempotent insert via unique partial index
    const { data: logRow, error: insertErr } = await supabase
      .from("notification_log")
      .insert({
        game_id,
        recipient_session_id: player.session_id,
        recipient_device_id: token?.device_id ?? null,
        kind: "turn",
        round: game.round,
        player_index: game.current_player_index,
        delivered: false,
        metadata: { title, body, opponent_name: opponentName },
      })
      .select()
      .single();

    if (insertErr) {
      // 23505 = duplicate (already sent for this turn) — that's fine.
      if ((insertErr as { code?: string }).code === "23505") {
        return json({ skipped: "already sent for this turn" });
      }
      return json({ error: insertErr.message }, 500);
    }

    let delivered = false;
    if (token?.token) {
      delivered = await sendApns({
        deviceToken: token.token,
        title,
        body,
        data: { game_id, kind: "turn", notification_id: logRow.id },
      });
      if (delivered) {
        await supabase
          .from("notification_log")
          .update({ delivered: true })
          .eq("id", logRow.id);
      }
    }

    // Also write an analytics event row directly so we don't depend on client to log.
    await supabase.from("analytics_events").insert({
      event_name: "turn_notification_sent",
      device_id: token?.device_id ?? null,
      local_user_id: token?.device_id ?? null,
      game_id,
      game_mode: "multiplayer",
      metadata: { delivered, opponent_name: opponentName },
      platform: token?.platform ?? "server",
      app_version: "1.0.0",
    });

    return json({ success: true, delivered, queued: !delivered });
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
  const authKey = Deno.env.get("APNS_AUTH_KEY"); // .p8 contents
  const env = Deno.env.get("APNS_ENV") ?? "production"; // 'sandbox' for dev

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

// Builds an ES256 JWT for APNs from a .p8 PEM private key.
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
