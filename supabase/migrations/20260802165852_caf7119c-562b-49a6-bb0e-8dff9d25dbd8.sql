CREATE OR REPLACE FUNCTION public.expire_match(p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_game RECORD;
  v_last timestamptz;
BEGIN
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF v_game IS NULL THEN
    RETURN jsonb_build_object('expired', false, 'reason', 'not_found');
  END IF;

  IF v_game.status NOT IN ('waiting'::public.game_status, 'playing'::public.game_status) THEN
    IF v_game.forfeited_by = 'Tidsgräns' THEN
      DELETE FROM public.friend_match_results WHERE game_id = p_game_id::text;
    END IF;
    RETURN jsonb_build_object('expired', false, 'reason', 'not_active');
  END IF;

  -- Only real activity on the game itself (moves) counts. Presence/heartbeat
  -- on game_players must NOT reset the 48h clock.
  v_last := GREATEST(v_game.created_at, v_game.updated_at);

  IF v_last > now() - interval '48 hours' THEN
    RETURN jsonb_build_object('expired', false, 'reason', 'still_fresh');
  END IF;

  UPDATE public.games
  SET status = 'finished'::public.game_status,
      forfeited_by = 'Tidsgräns'
  WHERE id = p_game_id;

  DELETE FROM public.friend_match_results WHERE game_id = p_game_id::text;

  RETURN jsonb_build_object('expired', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.expire_stale_matches()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  WITH stale AS (
    SELECT g.id
    FROM public.games g
    WHERE g.status IN ('waiting'::public.game_status, 'playing'::public.game_status)
      AND GREATEST(g.created_at, g.updated_at) < now() - interval '48 hours'
  ), cleared AS (
    DELETE FROM public.friend_match_results f
    USING stale
    WHERE f.game_id = stale.id::text
    RETURNING f.game_id
  ), updated AS (
    UPDATE public.games g
    SET status = 'finished'::public.game_status,
        forfeited_by = 'Tidsgräns'
    FROM stale
    WHERE g.id = stale.id
    RETURNING g.id
  )
  SELECT count(*) INTO v_count FROM updated;
  RETURN v_count;
END;
$function$;