CREATE OR REPLACE FUNCTION public.perform_roll_dice(
  p_game_id uuid,
  p_session_id text,
  p_client_dice integer[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_game RECORD;
  v_player RECORD;
  v_locked boolean[];
  v_new_dice integer[];
  v_use_client boolean := false;
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
  IF v_player.player_index != v_game.current_player_index THEN
    RETURN jsonb_build_object('success', false, 'error', 'Det är inte din tur');
  END IF;
  IF v_game.rolls_left <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Inga kast kvar');
  END IF;

  IF v_game.rolls_left = 3 THEN
    v_locked := ARRAY[false, false, false, false, false];
  ELSE
    v_locked := v_game.locked_dice;
  END IF;

  IF p_client_dice IS NOT NULL AND array_length(p_client_dice, 1) = 5 THEN
    v_use_client := true;
    FOR i IN 1..5 LOOP
      IF p_client_dice[i] IS NULL OR p_client_dice[i] < 1 OR p_client_dice[i] > 6 THEN
        v_use_client := false;
        EXIT;
      END IF;
    END LOOP;
  END IF;

  v_new_dice := ARRAY[]::integer[];
  FOR i IN 1..5 LOOP
    IF v_locked[i] THEN
      v_new_dice := v_new_dice || v_game.dice[i];
    ELSIF v_use_client THEN
      v_new_dice := v_new_dice || p_client_dice[i];
    ELSE
      v_new_dice := v_new_dice || (floor(random() * 6) + 1)::integer;
    END IF;
  END LOOP;

  UPDATE games
  SET dice = v_new_dice,
      rolls_left = v_game.rolls_left - 1,
      is_rolling = false,
      locked_dice = CASE WHEN v_game.rolls_left = 3
                         THEN ARRAY[false, false, false, false, false]
                         ELSE v_game.locked_dice END
  WHERE id = p_game_id;

  RETURN jsonb_build_object('success', true, 'dice', to_jsonb(v_new_dice), 'rolls_left', v_game.rolls_left - 1);
END;
$$;