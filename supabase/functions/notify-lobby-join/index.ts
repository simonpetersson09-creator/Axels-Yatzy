// Push to the host when a friend joins their waiting room.
// The game_players insert trigger queues the join in lobby_join_queue and pings
// this function; it only drains that queue (service role), so pings are harmless.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendPush } from "../_shared/apns.ts";
import { joinPushText } from "../_shared/push-join-i18n.ts";

const json = (body: object, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: rows } = await db.from("lobby_join_queue").delete().gte("id", 0).select("game_id, session_id");
    const out = await Promise.all((rows ?? []).map((r) => notify(db, r.game_id, r.session_id).catch((e) => ({ error: String(e) }))));
    return ({ results: out });
  }
}

// deno-lint-ignore no-explicit-any
async function notify(db: any, game_id: string, session_id: string) {
  {

    const { data: game } = await db.from("games").select("id, status, game_code").eq("id", game_id).maybeSingle();
    if (!game || game.status !== "waiting") return ({ skipped: "not waiting" });

    const { data: players } = await db.from("game_players")
      .select("session_id, player_name, player_index").eq("game_id", game_id).order("player_index");
    const host = players?.[0];
    const joiner = players?.find((p) => p.session_id === session_id);
    if (!host || !joiner || host.session_id === session_id) return ({ skipped: "no host" });

    const { data: token } = await db.from("push_tokens").select("device_id, token, platform")
      .eq("session_id", host.session_id).eq("enabled", true)
      .order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (!token?.token) return ({ skipped: "no token" });

    const { data: prefs } = await db.from("notification_preferences")
      .select("turn_notifications, lang").eq("device_id", token.device_id).maybeSingle();
    if (prefs && prefs.turn_notifications === false) return ({ skipped: "prefs off" });

    const { title, body } = joinPushText(prefs?.lang ?? null, joiner.player_name || "?");
    const res = await sendPush({
      platform: token.platform, deviceToken: token.token, title, body,
      data: { game_id, game_code: game.game_code ?? "", kind: "lobby_join" },
    });
    if (!res.ok && (res.status === 410 || res.reason === "Unregistered" || res.reason === "BadDeviceToken")) {
      await db.from("push_tokens").update({ enabled: false }).eq("token", token.token);
    }
    return ({ delivered: res.ok });
  }
}
