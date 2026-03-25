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

    // 2. Verify game is in waiting state
    if (game.status !== "waiting") {
      return json({ error: "Spelet har redan startat eller avslutats" }, 400);
    }

    // 3. Verify caller is host (player_index = 0)
    const { data: player, error: playerErr } = await supabase
      .from("game_players")
      .select("*")
      .eq("game_id", game_id)
      .eq("session_id", session_id)
      .single();

    if (playerErr || !player) {
      return json({ error: "Du tillhör inte detta spel" }, 403);
    }

    if (player.player_index !== 0) {
      return json({ error: "Bara värden kan starta spelet" }, 403);
    }

    // 4. Verify at least 2 players
    const { count, error: countErr } = await supabase
      .from("game_players")
      .select("*", { count: "exact", head: true })
      .eq("game_id", game_id);

    if (countErr || !count || count < 2) {
      return json({ error: "Minst 2 spelare krävs för att starta" }, 400);
    }

    // 5. Start the game
    const { error: updateErr } = await supabase
      .from("games")
      .update({ status: "playing" })
      .eq("id", game_id)
      .eq("status", "waiting"); // conditional update for safety

    if (updateErr) {
      return json({ error: "Kunde inte starta spelet" }, 500);
    }

    return json({ success: true });
  } catch (_err) {
    return json({ error: "Internt serverfel" }, 500);
  }
});
