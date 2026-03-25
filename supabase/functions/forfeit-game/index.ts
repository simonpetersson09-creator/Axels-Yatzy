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
