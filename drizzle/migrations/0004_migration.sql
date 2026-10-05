CREATE OR REPLACE FUNCTION public.get_weekly_rank(p_session_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rank bigint; v_total bigint; v_games integer;
BEGIN
  WITH cur AS (
    SELECT s.session_id, s.games_played, s.created_at FROM public.player_country_stats s
  ),
  base AS (
    SELECT c.session_id,
      COALESCE(
        (SELECT h.games_played FROM public.player_games_history h
          WHERE h.session_id = c.session_id AND h.day <= current_date - 7
          ORDER BY h.day DESC LIMIT 1),
        (SELECT h.games_played FROM public.player_games_history h
          WHERE h.session_id = c.session_id ORDER BY h.day ASC LIMIT 1),
        0) AS base_games
    FROM cur c
  ),
  weekly AS (
    SELECT c.session_id, GREATEST(c.games_played - b.base_games, 0) AS w, c.created_at
    FROM cur c JOIN base b USING (session_id)
  ),
  ranked AS (
    SELECT session_id, w,
      ROW_NUMBER() OVER (ORDER BY w DESC, created_at ASC) AS rank,
      COUNT(*) OVER () AS total
    FROM weekly WHERE w > 0
  )
  SELECT rank, total, w INTO v_rank, v_total, v_games FROM ranked WHERE session_id = p_session_id;

  IF v_rank IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  RETURN jsonb_build_object('found', true, 'rank', v_rank, 'total', v_total, 'games_played', v_games);
END;
$function$;