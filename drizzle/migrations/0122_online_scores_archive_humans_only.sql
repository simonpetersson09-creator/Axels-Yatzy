CREATE OR REPLACE FUNCTION public.internal_archive_online_scores() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF OLD.status = 'finished' AND OLD.forfeited_by IS NULL AND OLD.round >= 15 THEN
    INSERT INTO online_match_scores(game_id, session_id, total, top, players, finished_at, source)
    SELECT OLD.id, t.session_id, t.total, t.top, t.n, OLD.updated_at, 'server'
    FROM (SELECT p.session_id, p.is_bot, internal_score_total(p.scores) total,
                 max(internal_score_total(p.scores)) OVER () top, count(*) OVER () n
          FROM game_players p WHERE p.game_id = OLD.id) t
    WHERE NOT t.is_bot AND EXISTS (SELECT 1 FROM session_owners so WHERE so.session_id = t.session_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN OLD;
END $$;