import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Delete game_players for stale waiting games (>1 hour) and old finished games (>24 hours)
    const { data: staleGames, error: fetchErr } = await supabase
      .from("games")
      .select("id")
      .or(
        `and(status.eq.waiting,created_at.lt.${new Date(Date.now() - 60 * 60 * 1000).toISOString()}),and(status.eq.finished,updated_at.lt.${new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()})`
      );

    if (fetchErr || !staleGames || staleGames.length === 0) {
      return json({ cleaned: 0 });
    }

    const ids = staleGames.map((g) => g.id);

    // Delete players first (no FK cascade since RLS blocks direct deletes, use service role)
    const { error: delPlayersErr } = await supabase
      .from("game_players")
      .delete()
      .in("game_id", ids);

    if (delPlayersErr) {
      console.error("Failed to delete game_players:", delPlayersErr);
    }

    const { error: delGamesErr } = await supabase
      .from("games")
      .delete()
      .in("id", ids);

    if (delGamesErr) {
      console.error("Failed to delete games:", delGamesErr);
    }

    return json({ cleaned: ids.length });
  } catch (err) {
    console.error("Cleanup error:", err);
    return json({ error: "Cleanup failed" }, 500);
  }
});
