
CREATE OR REPLACE FUNCTION public.cleanup_unjoined_lobbies()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH stale AS (
    SELECT g.id
    FROM public.games g
    WHERE g.status = 'waiting'::public.game_status
      AND g.created_at < now() - interval '10 minutes'
      AND (SELECT count(*) FROM public.game_players gp WHERE gp.game_id = g.id) < 2
  ), updated AS (
    UPDATE public.games g
    SET status = 'finished'::public.game_status,
        forfeited_by = COALESCE(g.forfeited_by, 'Ej accepterad')
    FROM stale
    WHERE g.id = stale.id
    RETURNING g.id
  )
  SELECT count(*) INTO v_count FROM updated;
  RETURN v_count;
END;
$$;

DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'cleanup-unjoined-lobbies';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
END $$;

SELECT cron.schedule(
  'cleanup-unjoined-lobbies',
  '* * * * *',
  $$ SELECT public.cleanup_unjoined_lobbies(); $$
);
