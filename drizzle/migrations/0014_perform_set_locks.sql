CREATE OR REPLACE FUNCTION public.perform_set_locks(p_game_id uuid, p_session_id text, p_locked boolean[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_game RECORD;
  v_player RECORD;
BEGIN
  IF p_locked IS NULL OR array_length(p_locked, 1) IS DISTINCT FROM 5 OR array_position(p_locked, NULL) IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'locked_dice måste vara 5 värden');
  END IF;

  SELECT * INTO v_game FROM games WHERE id = p_game_id FOR UPDATE;
  IF v_game IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Spelet hittades inte');
  END IF;
  IF v_game.status != 'playing' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Spelet är inte aktivt');
  END IF;
  IF v_game.rolls_left = 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Du måste kasta först');
  END IF;
  IF v_game.rolls_left = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Inga kast kvar, välj kategori');
  END IF;

  SELECT * INTO v_player FROM game_players
  WHERE game_id = p_game_id AND session_id = p_session_id;
  IF v_player IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Du tillhör inte detta spel');
  END IF;
  IF v_player.player_index != v_game.current_player_index THEN
    RETURN jsonb_build_object('success', false, 'error', 'Det är inte din tur');
  END IF;

  IF v_game.locked_dice IS DISTINCT FROM p_locked THEN
    UPDATE games SET locked_dice = p_locked WHERE id = p_game_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'locked_dice', to_jsonb(p_locked));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.perform_set_locks(uuid, text, boolean[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.perform_set_locks(uuid, text, boolean[]) TO service_role;