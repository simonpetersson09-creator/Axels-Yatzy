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

  // Internal-only: cron/scheduler must supply the shared secret.
  const expectedSecret = Deno.env.get("INTERNAL_NOTIFY_SECRET");
  if (!expectedSecret || req.headers.get("x-internal-secret") !== expectedSecret) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Cleanup criteria:
    //  - waiting games older than 1 hour (lobby never started)
    //  - finished games older than 24 hours
    //  - playing games inactive (updated_at) older than 14 days (truly abandoned)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    // 1) Mark abandoned 'playing' games as finished FIRST so the
    //    trg_games_finished_record_match trigger fires and friend_match_results
    //    gets a final row. We do NOT set forfeited_by here — that field steers
    //    record_friend_match's winner logic and a system string ("Inaktiv")
    //    would always make player_index=0 win. Leaving it NULL lets the score
    //    comparison decide (typically a 0-0 draw for fully abandoned games).
    //    Single UPDATE … RETURNING avoids a TOCTOU race between SELECT and UPDATE.
    const { data: finalized, error: finishErr } = await supabase
      .from("games")
      .update({ status: "finished" })
      .eq("status", "playing")
      .lt("updated_at", fourteenDaysAgo)
      .select("id");

    if (finishErr) {
      console.error("Failed to finalize stale playing games:", finishErr);
      return json({ error: "Failed to finalize stale playing games", details: finishErr.message }, 500);
    }
    const finalizedCount = finalized?.length ?? 0;

    // 2) Now fetch everything safe to delete: old waiting + old finished.
    //    FK game_players.game_id ON DELETE CASCADE handles player rows.
    const { data: staleGames, error: fetchErr } = await supabase
      .from("games")
      .select("id")
      .or(
        `and(status.eq.waiting,created_at.lt.${oneHourAgo}),and(status.eq.finished,updated_at.lt.${oneDayAgo})`
      );

    if (fetchErr) {
      console.error("Failed to fetch stale games:", fetchErr);
      return json({ error: "Failed to fetch stale games", details: fetchErr.message }, 500);
    }
    if (!staleGames || staleGames.length === 0) {
      return json({ cleaned: 0, finalized: finalizedCount });
    }

    const ids = staleGames.map((g) => g.id);

    // M-NEW-3: Mark any linked game_invites as 'expired' before deleting the
    // games they reference. The FK from game_invites.game_id is ON DELETE SET
    // NULL (or similar), so without this step those invite rows would survive
    // pointing at a deleted game. Doing this BEFORE the games delete keeps the
    // status consistent in case a client is mid-read.
    const { error: invErr } = await supabase
      .from("game_invites")
      .update({ status: "expired" })
      .in("game_id", ids)
      .neq("status", "expired");
    if (invErr) {
      console.warn("Failed to expire linked invites:", invErr.message);
    }

    const { error: delGamesErr } = await supabase
      .from("games")
      .delete()
      .in("id", ids);

    if (delGamesErr) {
      console.error("Failed to delete games:", delGamesErr);
      return json({ error: "Failed to delete games", details: delGamesErr.message, attempted: ids.length }, 500);
    }


    return json({ cleaned: ids.length, finalized: finalizedCount });
  } catch (err) {
    console.error("Cleanup error:", err);
    return json({ error: "Cleanup failed" }, 500);
  }
});
