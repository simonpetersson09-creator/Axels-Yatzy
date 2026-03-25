
CREATE OR REPLACE FUNCTION public.validate_game_session(
  p_game_id UUID,
  p_session_id TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game RECORD;
  v_player RECORD;
BEGIN
  -- Check game exists
  SELECT id, status, game_code INTO v_game
  FROM games
  WHERE id = p_game_id;

  IF v_game IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Spelet finns inte');
  END IF;

  -- Check player membership
  SELECT id, player_index, player_name INTO v_player
  FROM game_players
  WHERE game_id = p_game_id AND session_id = p_session_id;

  IF v_player IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Du tillhör inte detta spel');
  END IF;

  -- Check valid status for reconnect
  IF v_game.status NOT IN ('waiting', 'playing') THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Spelet kan inte återanslutas');
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'game_id', v_game.id,
    'game_code', v_game.game_code,
    'status', v_game.status,
    'player_index', v_player.player_index
  );
END;
$$;
