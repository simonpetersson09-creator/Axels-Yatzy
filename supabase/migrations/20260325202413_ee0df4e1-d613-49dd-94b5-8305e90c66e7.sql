
CREATE OR REPLACE FUNCTION public.perform_start_game(p_game_id uuid, p_session_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_game RECORD;
  v_player RECORD;
  v_player_count integer;
BEGIN
  SELECT * INTO v_game FROM games WHERE id = p_game_id FOR UPDATE;
  IF v_game IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Spelet hittades inte');
  END IF;
  IF v_game.status != 'waiting' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Spelet har redan startat eller avslutats');
  END IF;

  SELECT * INTO v_player FROM game_players
  WHERE game_id = p_game_id AND session_id = p_session_id;
  IF v_player IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Du tillhör inte detta spel');
  END IF;
  IF v_player.player_index != 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bara värden kan starta spelet');
  END IF;

  SELECT count(*) INTO v_player_count FROM game_players WHERE game_id = p_game_id;
  IF v_player_count < 2 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Minst 2 spelare krävs för att starta');
  END IF;

  UPDATE games SET status = 'playing'::game_status WHERE id = p_game_id;

  RETURN jsonb_build_object('success', true);
END;
$$;
