import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const { game_id, session_id, dice_index, device_id, actor_session_id } = await req.json();

    if (!game_id || !session_id || dice_index === undefined || dice_index === null) {
      return json({ error: "game_id, session_id and dice_index required" }, 400);
    }

    if (typeof dice_index !== "number" || !Number.isInteger(dice_index) || dice_index < 0 || dice_index > 4) {
      return json({ error: "dice_index must be an integer between 0 and 4" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Authorize: the calling device must own the acting session. The actor
    // is either the player themself, or (online quick match only) another
    // human in the same match playing for a computer seat / a player idle 60s+.
    if (typeof device_id !== "string" || device_id.length < 8 || device_id.length > 64) {
      return json({ error: "Unauthorized" }, 403);
    }
    const actor = typeof actor_session_id === "string" && actor_session_id ? actor_session_id : session_id;
    const { data: owner } = await supabase
      .from("session_owners").select("device_id").eq("session_id", actor).maybeSingle();
    if (!owner || owner.device_id !== device_id) {
      return json({ error: "Unauthorized" }, 403);
    }
    if (actor !== session_id) {
      const { data: game } = await supabase
        .from("games").select("is_quick_match").eq("id", game_id).maybeSingle();
      const { data: players } = await supabase
        .from("game_players").select("session_id, is_bot, last_active_at").eq("game_id", game_id);
      const target = (players ?? []).find((p: { session_id: string }) => p.session_id === session_id);
      const actorIn = (players ?? []).some((p: { session_id: string; is_bot: boolean }) => p.session_id === actor && !p.is_bot);
      const idle = target && (target.is_bot || Date.now() - new Date(target.last_active_at).getTime() >= 55_000);
      if (!game?.is_quick_match || !actorIn || !idle) {
        return json({ error: "Unauthorized" }, 403);
      }
    }

    const { data, error } = await supabase.rpc("perform_toggle_lock", {
      p_game_id: game_id,
      p_session_id: session_id,
      p_dice_index: dice_index,
    });

    if (error) {
      return json({ error: "Databasfel vid låsning" }, 500);
    }

    const result = data as { success: boolean; error?: string; locked_dice?: boolean[] };

    if (!result.success) {
      return json({ error: result.error }, 400);
    }

    return json({ success: true, locked_dice: result.locked_dice });
  } catch (_err) {
    return json({ error: "Internt serverfel" }, 500);
  }
});
