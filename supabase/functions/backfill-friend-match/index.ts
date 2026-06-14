// Fallback endpoint: lets either player of a finished 2-player match ensure that
// a friend_match_results row exists. The actual write happens via the
// SECURITY DEFINER RPC record_friend_match, but we first validate that the
// caller's session_id is part of the game (so randoms can't spam the RPC).

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
    const { game_id, session_id } = await req.json().catch(() => ({}));
    if (!game_id || !session_id) {
      return json({ error: "game_id and session_id required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Validate caller belongs to the game
    const { data: player } = await supabase
      .from("game_players")
      .select("id")
      .eq("game_id", game_id)
      .eq("session_id", session_id)
      .maybeSingle();
    if (!player) return json({ error: "Du tillhör inte detta spel" }, 403);

    // Short-circuit if already recorded
    const { data: existing } = await supabase
      .from("friend_match_results")
      .select("id")
      .eq("game_id", String(game_id))
      .maybeSingle();
    if (existing) return json({ success: true, already_recorded: true });

    const { data, error } = await supabase.rpc("record_friend_match", {
      p_game_id: game_id,
      p_session_id: session_id,
    });
    if (error) {
      console.warn("[backfill-friend-match] rpc failed", error.message);
      return json({ error: "Databasfel" }, 500);
    }
    return json({ success: true, result: data });
  } catch (err) {
    console.error("[backfill-friend-match] error", err);
    return json({ error: (err as Error).message }, 500);
  }
});
