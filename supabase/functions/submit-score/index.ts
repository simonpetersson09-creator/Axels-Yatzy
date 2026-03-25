import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VALID_CATEGORIES = [
  "ones", "twos", "threes", "fours", "fives", "sixes",
  "pair", "twoPairs", "threeOfAKind", "fourOfAKind",
  "smallStraight", "largeStraight", "fullHouse", "chance", "yatzy",
];

// ---- Scoring logic (server-side copy) ----

function getCounts(dice: number[]): number[] {
  const counts = [0, 0, 0, 0, 0, 0];
  dice.forEach((d) => counts[d - 1]++);
  return counts;
}

function sumOf(dice: number[], value: number): number {
  return dice.filter((d) => d === value).reduce((a, b) => a + b, 0);
}

function nOfAKind(dice: number[], n: number): number {
  const counts = getCounts(dice);
  for (let i = 5; i >= 0; i--) {
    if (counts[i] >= n) return (i + 1) * n;
  }
  return 0;
}

function calculateScore(dice: number[], category: string): number {
  const counts = getCounts(dice);
  const sorted = [...dice].sort((a, b) => a - b);
  const sum = dice.reduce((a, b) => a + b, 0);

  switch (category) {
    case "ones": return sumOf(dice, 1);
    case "twos": return sumOf(dice, 2);
    case "threes": return sumOf(dice, 3);
    case "fours": return sumOf(dice, 4);
    case "fives": return sumOf(dice, 5);
    case "sixes": return sumOf(dice, 6);
    case "pair": {
      for (let i = 5; i >= 0; i--) {
        if (counts[i] >= 2) return (i + 1) * 2;
      }
      return 0;
    }
    case "twoPairs": {
      const pairs: number[] = [];
      for (let i = 5; i >= 0; i--) {
        if (counts[i] >= 4) { pairs.push(i + 1); pairs.push(i + 1); }
        else if (counts[i] >= 2) { pairs.push(i + 1); }
      }
      if (pairs.length >= 2) return pairs[0] * 2 + pairs[1] * 2;
      return 0;
    }
    case "threeOfAKind": return nOfAKind(dice, 3);
    case "fourOfAKind": return nOfAKind(dice, 4);
    case "smallStraight": return sorted.join("") === "12345" ? 15 : 0;
    case "largeStraight": return sorted.join("") === "23456" ? 20 : 0;
    case "fullHouse": {
      const hasThree = counts.some((c) => c === 3);
      const hasTwo = counts.some((c) => c === 2);
      return hasThree && hasTwo ? sum : 0;
    }
    case "chance": return sum;
    case "yatzy": return counts.some((c) => c === 5) ? 50 : 0;
    default: return 0;
  }
}

// ---- Main handler ----

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
    const { game_id, session_id, category_id } = await req.json();

    if (!game_id || !session_id || !category_id) {
      return json({ error: "game_id, session_id, and category_id required" }, 400);
    }

    if (!VALID_CATEGORIES.includes(category_id)) {
      return json({ error: "Ogiltig kategori" }, 400);
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

    // 2. Fetch all players ordered by index
    const { data: players, error: playersErr } = await supabase
      .from("game_players")
      .select("*")
      .eq("game_id", game_id)
      .order("player_index");

    if (playersErr || !players) return json({ error: "Kunde inte hämta spelare" }, 500);

    // 3. Find requesting player and verify turn
    const player = players.find((p) => p.session_id === session_id);
    if (!player) return json({ error: "Du tillhör inte detta spel" }, 403);
    if (player.player_index !== game.current_player_index) {
      return json({ error: "Det är inte din tur" }, 403);
    }

    // 4. Verify player hasn't already rolled (rolls_left must be < 3)
    if (game.rolls_left === 3) {
      return json({ error: "Du måste kasta tärningarna först" }, 400);
    }

    // 5. Verify category not already used
    const scores = (player.scores as Record<string, number | null>) ?? {};
    if (scores[category_id] !== undefined && scores[category_id] !== null) {
      return json({ error: "Kategorin är redan använd" }, 400);
    }

    // 6. Calculate score server-side from DB dice
    const dice = game.dice as number[];
    const score = calculateScore(dice, category_id);
    const newScores = { ...scores, [category_id]: score };

    // 7. Update player scores
    const { error: scoreErr } = await supabase
      .from("game_players")
      .update({ scores: newScores })
      .eq("id", player.id);

    if (scoreErr) return json({ error: "Kunde inte spara poäng" }, 500);

    // 8. Determine next turn / game over
    const allFilled = VALID_CATEGORIES.every(
      (cat) => newScores[cat] !== undefined && newScores[cat] !== null
    );

    const nextPlayerIndex = (game.current_player_index + 1) % players.length;

    let gameOver = false;
    if (allFilled) {
      // Check if ALL players have filled all categories
      const allDone = players.every((p) => {
        const s = p.id === player.id
          ? newScores
          : ((p.scores as Record<string, number | null>) ?? {});
        return VALID_CATEGORIES.every((cat) => s[cat] !== undefined && s[cat] !== null);
      });
      if (allDone) gameOver = true;
    }

    // 9. Update game state atomically
    const { error: gameUpdateErr } = await supabase
      .from("games")
      .update({
        current_player_index: gameOver ? game.current_player_index : nextPlayerIndex,
        dice: [1, 1, 1, 1, 1],
        locked_dice: [false, false, false, false, false],
        rolls_left: 3,
        is_rolling: false,
        status: gameOver ? "finished" : "playing",
        round: nextPlayerIndex === 0 ? game.round + 1 : game.round,
      })
      .eq("id", game_id);

    if (gameUpdateErr) return json({ error: "Kunde inte uppdatera spelet" }, 500);

    return json({
      success: true,
      score,
      category_id,
      game_over: gameOver,
    });
  } catch (_err) {
    return json({ error: "Internt serverfel" }, 500);
  }
});
