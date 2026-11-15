DROP FUNCTION IF EXISTS public.client_roll_diagnosed(uuid, text, text, boolean[], uuid);

CREATE FUNCTION public.client_roll_diagnosed(
  p_game_id uuid,
  p_session_id text,
  p_device_id text,
  p_locked boolean[],
  p_attempt_id uuid,
  p_expected_rolls_left integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  v_game record;
BEGIN
  -- A resent roll names the roll count it was made for. The row lock
  -- serialises it with a still-running original, so one tap never spends two rolls.
  IF p_expected_rolls_left IS NOT NULL THEN
    SELECT rolls_left, dice, round, current_player_index INTO v_game
    FROM games WHERE id = p_game_id FOR UPDATE;
    IF FOUND AND v_game.rolls_left IS DISTINCT FROM p_expected_rolls_left THEN
      result := jsonb_build_object(
        'success', false, 'stale_command', true, 'stale_roll', true,
        'error', 'roll already applied',
        'dice', to_jsonb(v_game.dice), 'rolls_left', v_game.rolls_left,
        'round', v_game.round, 'current_player_index', v_game.current_player_index);
      PERFORM public.internal_record_request_timing(p_attempt_id, p_session_id, p_device_id, 'roll', result);
      RETURN result;
    END IF;
  END IF;
  result := public.client_roll(p_game_id, p_session_id, p_device_id, p_locked);
  PERFORM public.internal_record_request_timing(p_attempt_id, p_session_id, p_device_id, 'roll', result);
  RETURN result;
END $function$;

REVOKE ALL ON FUNCTION public.client_roll_diagnosed(uuid, text, text, boolean[], uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_roll_diagnosed(uuid, text, text, boolean[], uuid, integer) TO anon, authenticated, service_role;