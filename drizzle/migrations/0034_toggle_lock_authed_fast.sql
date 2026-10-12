-- Old app versions toggle one die per tap. Device check + toggle in one call,
-- and the games row is locked only for the single UPDATE (no SELECT ... FOR UPDATE).
CREATE OR REPLACE FUNCTION public.perform_toggle_lock_authed(p_game_id uuid, p_session_id text, p_device_id text, p_dice_index integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_idx integer;
  v_new boolean[];
  v_game RECORD;
BEGIN
  IF p_device_id IS NOT NULL AND NOT public.claim_session(p_session_id, p_device_id) THEN
    RETURN jsonb_build_object('success', false, 'auth_failed', true, 'error', 'Fel enhet för spelaren');
  END IF;
  IF p_dice_index IS NULL OR p_dice_index < 0 OR p_dice_index > 4 THEN
    RETURN jsonb_build_object('success', false, 'error', 'dice_index måste vara 0-4');
  END IF;

  SELECT player_index INTO v_idx FROM game_players WHERE game_id = p_game_id AND session_id = p_session_id;
  IF v_idx IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Du tillhör inte detta spel');
  END IF;

  UPDATE games
  SET locked_dice[p_dice_index + 1] = NOT locked_dice[p_dice_index + 1]
  WHERE id = p_game_id AND status = 'playing' AND current_player_index = v_idx
    AND rolls_left BETWEEN 1 AND 2
  RETURNING locked_dice INTO v_new;

  IF v_new IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'locked_dice', to_jsonb(v_new));
  END IF;

  -- Not applied: report the same errors as before.
  SELECT status, rolls_left, current_player_index INTO v_game FROM games WHERE id = p_game_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Spelet hittades inte'); END IF;
  IF v_game.status <> 'playing' THEN RETURN jsonb_build_object('success', false, 'error', 'Spelet är inte aktivt'); END IF;
  IF v_game.rolls_left = 3 THEN RETURN jsonb_build_object('success', false, 'error', 'Du måste kasta först'); END IF;
  IF v_game.rolls_left = 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Inga kast kvar, välj kategori'); END IF;
  RETURN jsonb_build_object('success', false, 'error', 'Det är inte din tur');
END $$;

REVOKE ALL ON FUNCTION public.perform_toggle_lock_authed(uuid,text,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.perform_toggle_lock_authed(uuid,text,text,integer) TO service_role;