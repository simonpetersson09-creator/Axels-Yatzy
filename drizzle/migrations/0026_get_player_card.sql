CREATE OR REPLACE FUNCTION public.get_player_card(p_session_id text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH scored AS (
    SELECT gp.game_id, gp.session_id,
      (SELECT coalesce(sum(CASE WHEN jsonb_typeof(v) = 'number' THEN v::text::int ELSE 0 END), 0) FROM jsonb_each(gp.scores) e(k, v)) +
      CASE WHEN (SELECT coalesce(sum(CASE WHEN jsonb_typeof(v) = 'number' THEN v::text::int ELSE 0 END), 0) FROM jsonb_each(gp.scores) e(k, v)
                 WHERE k IN ('ones','twos','threes','fours','fives','sixes')) >= 63 THEN 50 ELSE 0 END AS total
    FROM game_players gp JOIN games g ON g.id = gp.game_id
    WHERE g.status = 'finished' AND g.forfeited_by IS NULL AND g.round >= 15
      AND gp.game_id IN (SELECT game_id FROM game_players WHERE session_id = p_session_id)
  ),
  mine AS (
    SELECT s.game_id, s.total, (SELECT max(o.total) FROM scored o WHERE o.game_id = s.game_id) AS top,
           (SELECT count(*) FROM scored o WHERE o.game_id = s.game_id) AS n
    FROM scored s WHERE s.session_id = p_session_id
  ),
  agg AS (
    SELECT count(*) AS online_matches, round(avg(total))::int AS avg_score, max(total) AS best_score,
           count(*) FILTER (WHERE total = top) AS wins
    FROM mine WHERE n > 1
  ),
  ranks AS (
    SELECT session_id, ROW_NUMBER() OVER (ORDER BY games_played DESC, created_at ASC) AS world_rank
    FROM player_country_stats
  )
  SELECT jsonb_build_object(
    'tier', coalesce((SELECT tier FROM dice_progress WHERE session_id = p_session_id), 'white'),
    'yatzy_matches', coalesce((SELECT yatzy_matches FROM dice_progress WHERE session_id = p_session_id), 0),
    'invite_gold', EXISTS (SELECT 1 FROM referral_rewards r WHERE r.session_id = p_session_id AND r.gold_until > now()),
    'matches', greatest(coalesce((SELECT games_played FROM player_country_stats WHERE session_id = p_session_id), 0), (SELECT online_matches FROM agg)),
    'online_matches', (SELECT online_matches FROM agg),
    'avg_score', (SELECT avg_score FROM agg),
    'best_score', (SELECT best_score FROM agg),
    'online_wins', (SELECT wins FROM agg),
    'world_rank', (SELECT world_rank FROM ranks WHERE session_id = p_session_id),
    'avatar', (SELECT image FROM player_avatars WHERE session_id = p_session_id)
  );
$$;
GRANT EXECUTE ON FUNCTION public.get_player_card(text) TO anon, authenticated;