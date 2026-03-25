
-- C1: Atomic perform_toggle_lock RPC
CREATE OR REPLACE FUNCTION public.perform_toggle_lock(p_game_id uuid, p_session_id text, p_dice_index integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_game RECORD;
  v_player RECORD;
  v_new_locked boolean[];
BEGIN
  IF p_dice_index IS NULL OR p_dice_index < 0 OR p_dice_index > 4 THEN
    RETURN jsonb_build_object('success', false, 'error', 'dice_index måste vara 0-4');
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

  SELECT * INTO v_player FROM game_players
  WHERE game_id = p_game_id AND session_id = p_session_id;
  IF v_player IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Du tillhör inte detta spel');
  END IF;
  IF v_player.player_index != v_game.current_player_index THEN
    RETURN jsonb_build_object('success', false, 'error', 'Det är inte din tur');
  END IF;

  v_new_locked := v_game.locked_dice;
  v_new_locked[p_dice_index + 1] := NOT v_new_locked[p_dice_index + 1];

  UPDATE games SET locked_dice = v_new_locked WHERE id = p_game_id;

  RETURN jsonb_build_object('success', true, 'locked_dice', to_jsonb(v_new_locked));
END;
$$;

-- C2: Atomic perform_forfeit RPC
CREATE OR REPLACE FUNCTION public.perform_forfeit(p_game_id uuid, p_session_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_game RECORD;
  v_player RECORD;
  v_update_count integer;
BEGIN
  SELECT * INTO v_game FROM games WHERE id = p_game_id FOR UPDATE;
  IF v_game IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Spelet hittades inte');
  END IF;
  IF v_game.status != 'playing' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Spelet är inte aktivt');
  END IF;

  SELECT * INTO v_player FROM game_players
  WHERE game_id = p_game_id AND session_id = p_session_id;
  IF v_player IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Du tillhör inte detta spel');
  END IF;

  UPDATE games SET status = 'finished'::game_status
  WHERE id = p_game_id AND status = 'playing';
  GET DIAGNOSTICS v_update_count = ROW_COUNT;

  IF v_update_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Spelet har redan avslutats');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'game_ended', true,
    'forfeited_player', v_player.player_name,
    'forfeited_player_index', v_player.player_index
  );
END;
$$;
