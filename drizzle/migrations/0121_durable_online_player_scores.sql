CREATE TABLE public.online_match_scores (
  game_id uuid NOT NULL,
  session_id text NOT NULL REFERENCES public.session_owners(session_id) ON DELETE CASCADE,
  total integer NOT NULL,
  top integer NOT NULL,
  players integer NOT NULL,
  finished_at timestamptz NOT NULL,
  source text NOT NULL,
  PRIMARY KEY (game_id, session_id)
);
GRANT ALL ON public.online_match_scores TO service_role;
ALTER TABLE public.online_match_scores ENABLE ROW LEVEL SECURITY;
CREATE INDEX online_match_scores_session_idx ON public.online_match_scores(session_id);

CREATE OR REPLACE FUNCTION public.internal_score_total(p jsonb) RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT (SELECT coalesce(sum(CASE WHEN jsonb_typeof(v)='number' THEN v::text::int ELSE 0 END),0) FROM jsonb_each(p) e(k,v)) +
    CASE WHEN (SELECT coalesce(sum(CASE WHEN jsonb_typeof(v)='number' THEN v::text::int ELSE 0 END),0) FROM jsonb_each(p) e(k,v)
      WHERE k IN ('ones','twos','threes','fours','fives','sixes')) >= 63 THEN 50 ELSE 0 END
$$;

-- Archive each human's completed online result before cleanup deletes the game.
CREATE OR REPLACE FUNCTION public.internal_archive_online_scores() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF OLD.status = 'finished' AND OLD.forfeited_by IS NULL AND OLD.round >= 15 THEN
    INSERT INTO online_match_scores(game_id, session_id, total, top, players, finished_at, source)
    SELECT OLD.id, t.session_id, t.total, max(t.total) OVER (), count(*) OVER (), OLD.updated_at, 'server'
    FROM (SELECT p.session_id, p.is_bot, internal_score_total(p.scores) total FROM game_players p WHERE p.game_id = OLD.id) t
    WHERE true
    ON CONFLICT DO NOTHING;
    DELETE FROM online_match_scores s USING game_players p
      WHERE s.game_id = OLD.id AND p.game_id = OLD.id AND p.session_id = s.session_id AND p.is_bot;
  END IF;
  RETURN OLD;
EXCEPTION WHEN foreign_key_violation THEN
  RETURN OLD;
END $$;
CREATE TRIGGER archive_online_scores_before_game_delete BEFORE DELETE ON public.games
  FOR EACH ROW EXECUTE FUNCTION public.internal_archive_online_scores();

-- Backfill already-deleted friend matches from their separately stored results.
INSERT INTO public.online_match_scores(game_id, session_id, total, top, players, finished_at, source)
SELECT f.game_id::uuid, x.sid, x.score, greatest(f.player_1_score, f.player_2_score), 2, coalesce(f.finished_at, f.created_at), 'friend_result'
FROM public.friend_match_results f
CROSS JOIN LATERAL (VALUES (f.player_1_id, f.player_1_score), (f.player_2_id, f.player_2_score)) x(sid, score)
WHERE f.status = 'finished' AND f.player_1_score IS NOT NULL AND f.player_2_score IS NOT NULL
  AND f.game_id ~ '^[0-9a-f-]{36}$'
  AND NOT EXISTS (SELECT 1 FROM public.games g WHERE g.id::text = f.game_id)
  AND EXISTS (SELECT 1 FROM public.session_owners so WHERE so.session_id = x.sid)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_player_card(p_session_id text)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH scored AS (
    SELECT gp.game_id, gp.session_id, internal_score_total(gp.scores) AS total
    FROM game_players gp JOIN games g ON g.id = gp.game_id
    WHERE g.status = 'finished' AND g.forfeited_by IS NULL AND g.round >= 15
      AND gp.game_id IN (SELECT game_id FROM game_players WHERE session_id = p_session_id)
  ),
  mine AS (
    SELECT s.total, (SELECT max(o.total) FROM scored o WHERE o.game_id = s.game_id) AS top,
           (SELECT count(*) FROM scored o WHERE o.game_id = s.game_id) AS n
    FROM scored s WHERE s.session_id = p_session_id
    UNION ALL
    SELECT a.total, a.top, a.players FROM online_match_scores a
    WHERE a.session_id = p_session_id AND NOT EXISTS (SELECT 1 FROM games g WHERE g.id = a.game_id)
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
$function$;

CREATE OR REPLACE FUNCTION public.get_player_stats(p_game_id uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH me AS (
    SELECT player_index, session_id, is_bot FROM game_players WHERE game_id = p_game_id
  ),
  ranks AS (
    SELECT session_id, ROW_NUMBER() OVER (ORDER BY games_played DESC, created_at ASC) AS world_rank
    FROM public.player_country_stats
  ),
  live AS (
    SELECT gp.session_id, gp.game_id, internal_score_total(gp.scores) AS total
    FROM game_players gp JOIN games g ON g.id = gp.game_id
    WHERE g.status = 'finished' AND g.forfeited_by IS NULL AND g.round >= 15
      AND gp.game_id IN (SELECT game_id FROM game_players WHERE session_id IN (SELECT session_id FROM me WHERE NOT is_bot))
  ),
  results AS (
    SELECT l.session_id, l.total, (SELECT max(o.total) FROM live o WHERE o.game_id = l.game_id) AS top
    FROM live l
    WHERE l.session_id IN (SELECT session_id FROM me WHERE NOT is_bot)
      AND EXISTS (SELECT 1 FROM game_players o WHERE o.game_id = l.game_id AND o.session_id <> l.session_id)
    UNION ALL
    SELECT a.session_id, a.total, a.top FROM online_match_scores a
    WHERE a.session_id IN (SELECT session_id FROM me WHERE NOT is_bot) AND a.players > 1
      AND NOT EXISTS (SELECT 1 FROM games g WHERE g.id = a.game_id)
  ),
  agg AS (
    SELECT session_id, count(*) AS online_matches, round(avg(total))::int AS avg_score,
      max(total) AS best_score, count(*) FILTER (WHERE total = top) AS wins_or_ties
    FROM results GROUP BY session_id
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

CREATE OR REPLACE FUNCTION public.internal_grant_referral(p_invitee text, p_inviter text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_created timestamptz; v_dev text; v_inv_dev text;
BEGIN
  IF p_invitee IS NULL OR p_inviter IS NULL OR p_invitee = p_inviter THEN RETURN false; END IF;
  SELECT created_at, device_id INTO v_created, v_dev FROM session_owners WHERE session_id = p_invitee;
  IF v_created IS NULL OR v_created < now() - interval '48 hours' THEN RETURN false; END IF;
  SELECT device_id INTO v_inv_dev FROM session_owners WHERE session_id = p_inviter;
  IF v_inv_dev IS NULL OR v_inv_dev = v_dev THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM session_owners WHERE device_id = v_dev AND session_id <> p_invitee) THEN RETURN false; END IF;
  -- Online history survives cleanup in the archives, so deleted games still count as played.
  IF EXISTS (SELECT 1 FROM game_players WHERE session_id = p_invitee)
     OR EXISTS (SELECT 1 FROM admin_match_archive_players WHERE session_id = p_invitee)
     OR EXISTS (SELECT 1 FROM online_match_scores WHERE session_id = p_invitee) THEN RETURN false; END IF;
  RETURN public.internal_award_referral(p_invitee, p_inviter, NULL);
END $function$;