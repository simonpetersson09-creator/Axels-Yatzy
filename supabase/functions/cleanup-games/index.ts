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
  // Same two-step check as the sibling notify functions: the env secret first,
  // then the vault-backed internal_secret_matches() fallback. The scheduled job
  // reads its copy from the vault, and the vault copy and the env copy can
  // drift apart — with only the env check this endpoint rejected every run.
  const expectedSecret = (Deno.env.get("INTERNAL_NOTIFY_SECRET") ?? "").trim();
  const providedSecret = (req.headers.get("x-internal-secret") ?? "").trim();
  if (!providedSecret) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let authorized = Boolean(expectedSecret) && providedSecret === expectedSecret;
  if (!authorized) {
    const { data: vaultMatch } = await supabase.rpc("internal_secret_matches", {
      p_secret: providedSecret,
    });
    authorized = vaultMatch === true;
  }
  if (!authorized) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {

    // Cleanup criteria:
    //  - waiting games older than 7 hours (lobbies stay open 6 h, see cleanup_unjoined_lobbies)
    //  - finished games older than 24 hours
    //  - playing games inactive (updated_at) older than 14 days (truly abandoned)
    const oneHourAgo = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    // 1) Close abandoned 'playing' games. They are stamped with
    //    forfeited_by = 'Tidsgräns', which makes record_friend_match skip them
    //    entirely (and delete any lingering row), so an abandoned match can
    //    never sneak into the statistics as a ghost 0-0 result.
    //    Single UPDATE … RETURNING avoids a TOCTOU race between SELECT and UPDATE.

    const { data: finalized, error: finishErr } = await supabase
      .from("games")
      .update({ status: "finished", forfeited_by: "Tidsgräns" })
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
    //    Explicit range: a plain select caps at 1000 rows and the backlog is
    //    larger, so everything past row 1000 would never be reached.
    const { data: staleGames, error: fetchErr } = await supabase
      .from("games")
      .select("id")
      .or(
        `and(status.eq.waiting,created_at.lt.${oneHourAgo}),and(status.eq.finished,updated_at.lt.${oneDayAgo})`
      )
      .range(0, 4999);

    if (fetchErr) {
      console.error("Failed to fetch stale games:", fetchErr);
      return json({ error: "Failed to fetch stale games", details: fetchErr.message }, 500);
    }
    if (!staleGames || staleGames.length === 0) {
      return json({ cleaned: 0, finalized: finalizedCount });
    }

    const ids = staleGames.map((g) => g.id);

    // The id list travels as a query string, so one .in() over the whole
    // backlog blows past the request-size limit and PostgREST answers "Bad
    // Request" — which is why nothing was ever deleted. Work in batches.
    const BATCH = 200;
    let cleaned = 0;

    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH);

      // M-NEW-3: Mark any linked game_invites as 'expired' before deleting the
      // games they reference. The FK from game_invites.game_id is ON DELETE SET
      // NULL (or similar), so without this step those invite rows would survive
      // pointing at a deleted game. Doing this BEFORE the games delete keeps the
      // status consistent in case a client is mid-read.
      const { error: invErr } = await supabase
        .from("game_invites")
        .update({ status: "expired" })
        .in("game_id", batch)
        .neq("status", "expired");
      if (invErr) {
        console.warn("Failed to expire linked invites:", invErr.message);
      }

      const { error: delGamesErr } = await supabase
        .from("games")
        .delete()
        .in("id", batch);

      if (delGamesErr) {
        console.error("Failed to delete games:", delGamesErr);
        return json({
          error: "Failed to delete games",
          details: delGamesErr.message,
          attempted: cleaned + batch.length,
        }, 500);
      }

      cleaned += batch.length;
    }

    return json({ cleaned, finalized: finalizedCount });
  } catch (err) {
    console.error("Cleanup error:", err);
    return json({ error: "Cleanup failed" }, 500);
  }
});
