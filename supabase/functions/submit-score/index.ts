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
    const { game_id, session_id, category_id } = await req.json();

    if (!game_id || !session_id || !category_id) {
      return json({ error: "game_id, session_id, and category_id required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Call atomic RPC — score calc + player update + game state update in one transaction
    const { data, error } = await supabase.rpc("perform_submit_score", {
      p_game_id: game_id,
      p_session_id: session_id,
      p_category_id: category_id,
    });

    if (error) {
      return json({ error: "Databasfel vid poängsparning" }, 500);
    }

    const result = data as { success: boolean; error?: string; score?: number; category_id?: string; game_over?: boolean };

    if (!result.success) {
      return json({ error: result.error }, 400);
    }

    return json({
      success: true,
      score: result.score,
      category_id: result.category_id,
      game_over: result.game_over,
    });
  } catch (_err) {
    return json({ error: "Internt serverfel" }, 500);
  }
});
