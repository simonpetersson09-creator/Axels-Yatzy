import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function rollDice(current: number[], locked: boolean[]): number[] {
  return current.map((val, i) =>
    locked[i] ? val : Math.floor(Math.random() * 6) + 1
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { game_id, session_id } = await req.json();

    if (!game_id || !session_id) {
      return new Response(
        JSON.stringify({ error: "game_id and session_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role to bypass RLS and have full control
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Fetch game with row lock
    const { data: game, error: gameErr } = await supabase
      .from("games")
      .select("*")
      .eq("id", game_id)
      .single();

    if (gameErr || !game) {
      return new Response(
        JSON.stringify({ error: "Spelet hittades inte" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Verify game is active
    if (game.status !== "playing") {
      return new Response(
        JSON.stringify({ error: "Spelet är inte aktivt" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Verify player belongs to game
    const { data: player, error: playerErr } = await supabase
      .from("game_players")
      .select("*")
      .eq("game_id", game_id)
      .eq("session_id", session_id)
      .single();

    if (playerErr || !player) {
      return new Response(
        JSON.stringify({ error: "Du tillhör inte detta spel" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Verify it's this player's turn
    if (player.player_index !== game.current_player_index) {
      return new Response(
        JSON.stringify({ error: "Det är inte din tur" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Verify rolls left
    if (game.rolls_left <= 0) {
      return new Response(
        JSON.stringify({ error: "Inga kast kvar" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Generate dice server-side
    const locked = game.rolls_left === 3
      ? [false, false, false, false, false]
      : (game.locked_dice as boolean[]);
    const currentDice = game.dice as number[];
    const newDice = rollDice(currentDice, locked);

    // 7. Update game state atomically — is_rolling stays false,
    //    animation is handled client-side only
    const { error: updateErr } = await supabase
      .from("games")
      .update({
        dice: newDice,
        rolls_left: game.rolls_left - 1,
        is_rolling: false,
        locked_dice: game.rolls_left === 3
          ? [false, false, false, false, false]
          : game.locked_dice,
      })
      .eq("id", game_id);

    if (updateErr) {
      return new Response(
        JSON.stringify({ error: "Kunde inte uppdatera spelet" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, dice: newDice, rolls_left: game.rolls_left - 1 }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internt serverfel" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
