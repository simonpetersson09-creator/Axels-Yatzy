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
    const { game_id, session_id, client_dice, server_rolls } = await req.json();

    if (!game_id || !session_id) {
      return json({ error: "game_id and session_id required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // New app versions send server_rolls: true and the server rolls (fair
    // play). TEMPORARY: older versions (no flag) still get their own dice
    // accepted so their animation keeps matching. Remove this fallback once
    // most players have updated — until then the old path can be abused.
    let clientDice: number[] | null = null;
    if (
      server_rolls !== true &&
      Array.isArray(client_dice) &&
      client_dice.length === 5 &&
      client_dice.every((n) => Number.isInteger(n) && n >= 1 && n <= 6)
    ) {
      clientDice = client_dice as number[];
    }

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
