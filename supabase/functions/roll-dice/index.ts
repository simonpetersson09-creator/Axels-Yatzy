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
    const { game_id, session_id, client_dice } = await req.json();

    if (!game_id || !session_id) {
      return json({ error: "game_id and session_id required" }, 400);
    }

    // Validate optional client_dice: must be array of 5 ints in [1,6].
    // Invalid input → ignored (server RNG is used as fallback).
    let clientDice: number[] | null = null;
    if (
      Array.isArray(client_dice) &&
      client_dice.length === 5 &&
      client_dice.every((n) => Number.isInteger(n) && n >= 1 && n <= 6)
    ) {
      clientDice = client_dice as number[];
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Call atomic RPC — all validation + dice roll + update in one transaction
    const { data, error } = await supabase.rpc("perform_roll_dice", {
      p_game_id: game_id,
      p_session_id: session_id,
      p_client_dice: clientDice,
    });

    if (error) {
      return json({ error: "Databasfel vid tärningskast" }, 500);
    }

    const result = data as { success: boolean; error?: string; dice?: number[]; rolls_left?: number };

    if (!result.success) {
      return json({ error: result.error }, 400);
    }

    return json({ success: true, dice: result.dice, rolls_left: result.rolls_left });
  } catch (_err) {
    return json({ error: "Internt serverfel" }, 500);
  }
});
