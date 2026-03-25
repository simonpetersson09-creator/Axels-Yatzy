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
    const { game_id, session_id, dice_index } = await req.json();

    if (!game_id || !session_id || dice_index === undefined || dice_index === null) {
      return json({ error: "game_id, session_id and dice_index required" }, 400);
    }

    // Validate dice_index
    if (!Number.isInteger(dice_index) || dice_index < 0 || dice_index > 4) {
      return json({ error: "dice_index måste vara 0-4" }, 400);
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

    if (game.status !== "playing") {
      return json({ error: "Spelet är inte aktivt" }, 400);
    }

    // 2. Can't lock before first roll
    if (game.rolls_left === 3) {
      return json({ error: "Du måste kasta först" }, 400);
    }

    // 3. Verify player belongs to game and it's their turn
    const { data: player, error: playerErr } = await supabase
      .from("game_players")
      .select("*")
      .eq("game_id", game_id)
      .eq("session_id", session_id)
      .single();

    if (playerErr || !player) {
      return json({ error: "Du tillhör inte detta spel" }, 403);
    }

    if (player.player_index !== game.current_player_index) {
      return json({ error: "Det är inte din tur" }, 403);
    }

    // 4. Toggle the specific die
    const newLocked = [...(game.locked_dice as boolean[])];
    newLocked[dice_index] = !newLocked[dice_index];

    const { error: updateErr } = await supabase
      .from("games")
      .update({ locked_dice: newLocked })
      .eq("id", game_id);

    if (updateErr) {
      return json({ error: "Kunde inte uppdatera låsning" }, 500);
    }

    return json({ success: true, locked_dice: newLocked });
  } catch (_err) {
    return json({ error: "Internt serverfel" }, 500);
  }
});
