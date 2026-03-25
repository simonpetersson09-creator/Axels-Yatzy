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

    // 1. Fetch game
    const { data: game, error: gameErr } = await supabase
      .from("games")
      .select("*")
      .eq("id", game_id)
      .single();

    if (gameErr || !game) return json({ error: "Spelet hittades inte" }, 404);
    if (game.status !== "playing") return json({ error: "Spelet är inte aktivt" }, 400);

    // 2. Verify player belongs to game
    const { data: player, error: playerErr } = await supabase
      .from("game_players")
      .select("*")
      .eq("game_id", game_id)
      .eq("session_id", session_id)
      .single();

    if (playerErr || !player) return json({ error: "Du tillhör inte detta spel" }, 403);

    // 3. Get all players
    const { data: players } = await supabase
      .from("game_players")
      .select("*")
      .eq("game_id", game_id)
      .order("player_index");

    if (!players || players.length < 2) {
      // Solo game or error — just end it
      await supabase
        .from("games")
        .update({ status: "finished" })
        .eq("id", game_id);

      return json({ success: true, game_ended: true });
    }

    // 4. For 2-player games: end immediately, other player wins
    // For 3+ player games: also end (simplest fair rule)
    await supabase
      .from("games")
      .update({ status: "finished" })
      .eq("id", game_id);

    return json({
      success: true,
      game_ended: true,
      forfeited_player: player.player_name,
      forfeited_player_index: player.player_index,
    });
  } catch (_err) {
    return json({ error: "Internt serverfel" }, 500);
  }
});
