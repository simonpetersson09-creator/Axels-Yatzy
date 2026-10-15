CREATE OR REPLACE FUNCTION public.cleanup_unjoined_lobbies()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_count integer;
BEGIN
  WITH stale AS (
    SELECT g.id FROM public.games g
    WHERE g.status = 'waiting'::public.game_status
      AND g.created_at < now() - interval '6 hours'
      AND (SELECT count(*) FROM public.game_players gp WHERE gp.game_id = g.id) < 2
    FOR UPDATE SKIP LOCKED
  ), updated AS (
    UPDATE public.games g
    SET status = 'finished'::public.game_status,
        forfeited_by = COALESCE(g.forfeited_by, 'Ej accepterad')
    FROM stale WHERE g.id = stale.id
    RETURNING g.id
  )
  SELECT count(*) INTO v_count FROM updated;
  RETURN v_count;
END;
$function$;