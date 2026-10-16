// Push to the host when a friend joins their waiting room.
// Called only by the game_players insert trigger (internal secret). Best-effort.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendPush } from "../_shared/apns.ts";
import { joinPushText } from "../_shared/push-join-i18n.ts";

const json = (body: object, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const secret = Deno.env.get("INTERNAL_NOTIFY_SECRET");
  if (!secret || req.headers.get("x-internal-secret") !== secret) return json({ error: "Unauthorized" }, 401);
  try {
    const { game_id, session_id } = await req.json().catch(() => ({}));
    if (typeof game_id !== "string" || typeof session_id !== "string") return json({ error: "bad input" }, 400);
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: game } = await db.from("games").select("id, status, game_code").eq("id", game_id).maybeSingle();
    if (!game || game.status !== "waiting") return json({ skipped: "not waiting" });

    const { data: players } = await db.from("game_players")
      .select("session_id, player_name, player_index").eq("game_id", game_id).order("player_index");
    const host = players?.[0];
    const joiner = players?.find((p) => p.session_id === session_id);
    if (!host || !joiner || host.session_id === session_id) return json({ skipped: "no host" });

    const { data: token } = await db.from("push_tokens").select("device_id, token, platform")
      .eq("session_id", host.session_id).eq("enabled", true)
      .order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (!token?.token) return json({ skipped: "no token" });

    const { data: prefs } = await db.from("notification_preferences")
      .select("turn_notifications, lang").eq("device_id", token.device_id).maybeSingle();
    if (prefs && prefs.turn_notifications === false) return json({ skipped: "prefs off" });

    const { title, body } = joinPushText(prefs?.lang ?? null, joiner.player_name || "?");
    const res = await sendPush({
      platform: token.platform, deviceToken: token.token, title, body,
      data: { game_id, game_code: game.game_code ?? "", kind: "lobby_join" },
    });
    if (!res.ok && (res.status === 410 || res.reason === "Unregistered" || res.reason === "BadDeviceToken")) {
      await db.from("push_tokens").update({ enabled: false }).eq("token", token.token);
    }
    return json({ delivered: res.ok });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
