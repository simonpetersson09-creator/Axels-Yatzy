CREATE OR REPLACE FUNCTION public.get_player_stats(p_game_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH me AS (
    SELECT player_index, session_id, is_bot FROM game_players WHERE game_id = p_game_id
  ),
  ranks AS (
    SELECT session_id, ROW_NUMBER() OVER (ORDER BY games_played DESC, created_at ASC) AS world_rank
    FROM public.player_country_stats
  ),
  totals AS (
    SELECT gp.session_id, gp.game_id,
      (SELECT coalesce(sum(CASE WHEN jsonb_typeof(v) = 'number' THEN v::text::int ELSE 0 END), 0)
         FROM jsonb_each(gp.scores) e(k, v)) +
      CASE WHEN (SELECT coalesce(sum(CASE WHEN jsonb_typeof(v) = 'number' THEN v::text::int ELSE 0 END), 0)
                 FROM jsonb_each(gp.scores) e(k, v)
                 WHERE k IN ('ones','twos','threes','fours','fives','sixes')) >= 63 THEN 50 ELSE 0 END AS total
    FROM game_players gp
    JOIN games g ON g.id = gp.game_id
    WHERE g.status = 'finished' AND g.forfeited_by IS NULL AND g.round >= 15
      AND gp.session_id IN (SELECT session_id FROM me WHERE NOT is_bot)
      AND EXISTS (SELECT 1 FROM game_players o WHERE o.game_id = gp.game_id AND o.session_id <> gp.session_id)
  ),
  agg AS (
    SELECT t.session_id,
      count(*) AS online_matches,
      round(avg(t.total))::int AS avg_score,
      max(t.total) AS best_score,
      count(*) FILTER (WHERE t.total = (
        SELECT max(x.total) FROM (
          SELECT (SELECT coalesce(sum(CASE WHEN jsonb_typeof(v) = 'number' THEN v::text::int ELSE 0 END), 0) FROM jsonb_each(o.scores) e(k, v)) +
                 CASE WHEN (SELECT coalesce(sum(CASE WHEN jsonb_typeof(v) = 'number' THEN v::text::int ELSE 0 END), 0) FROM jsonb_each(o.scores) e(k, v)
                            WHERE k IN ('ones','twos','threes','fours','fives','sixes')) >= 63 THEN 50 ELSE 0 END AS total
          FROM game_players o WHERE o.game_id = t.game_id
        ) x)) AS wins_or_ties
    FROM totals t
    GROUP BY t.session_id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'player_index', me.player_index,
      'is_bot', me.is_bot,
      'matches', CASE WHEN me.is_bot THEN 0 ELSE greatest(coalesce(pcs.games_played, 0), coalesce(a.online_matches, 0)) END,
      'online_matches', CASE WHEN me.is_bot THEN 0 ELSE coalesce(a.online_matches, 0) END,
      'avg_score', CASE WHEN me.is_bot THEN NULL ELSE a.avg_score END,
      'best_score', CASE WHEN me.is_bot THEN NULL ELSE a.best_score END,
      'online_wins', CASE WHEN me.is_bot THEN 0 ELSE coalesce(a.wins_or_ties, 0) END,
      'world_rank', CASE WHEN me.is_bot THEN NULL ELSE r.world_rank END
    ) ORDER BY me.player_index), '[]'::jsonb)
  FROM me
  LEFT JOIN agg a ON a.session_id = me.session_id
  LEFT JOIN player_country_stats pcs ON pcs.session_id = me.session_id
  LEFT JOIN ranks r ON r.session_id = me.session_id;
$function$;