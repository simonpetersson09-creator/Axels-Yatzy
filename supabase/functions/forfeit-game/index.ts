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
    const { game_id, session_id } = await req.json();

    if (!game_id || !session_id) {
      return json({ error: "game_id and session_id required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error } = await supabase.rpc("perform_forfeit", {
      p_game_id: game_id,
      p_session_id: session_id,
    });

    if (error) {
      return json({ error: "Databasfel vid uppgivning" }, 500);
    }

    const result = data as { success: boolean; error?: string; game_ended?: boolean; forfeited_player?: string; forfeited_player_index?: number };

    if (!result.success) {
      return json({ error: result.error }, 400);
    }

    // Background push to opponent(s). Use EdgeRuntime.waitUntil so the promise
    // survives after the Response is returned (plain fire-and-forget is killed
    // by the Deno runtime and the notification never reaches APNs).
    if (result.game_ended) {
      const internalSecret = Deno.env.get("INTERNAL_NOTIFY_SECRET") ?? "";
      const notifyPromise = supabase.functions
        .invoke("notify-forfeit", {
          body: { game_id, forfeited_session_id: session_id },
          headers: { "x-internal-secret": internalSecret },
        })
        .catch((e) => console.warn("[forfeit-game] notify-forfeit failed", e));
      // @ts-ignore EdgeRuntime is provided by Supabase Edge Runtime
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(notifyPromise);
      }


      // friend_match_results is recorded by the AFTER UPDATE trigger on `games`
      // (trg_games_finished_record_match) — no explicit RPC call needed.
    }

    return json({
      success: true,
      game_ended: result.game_ended,
      forfeited_player: result.forfeited_player,
      forfeited_player_index: result.forfeited_player_index,
    });
  } catch (_err) {
    return json({ error: "Internt serverfel" }, 500);
  }
});
