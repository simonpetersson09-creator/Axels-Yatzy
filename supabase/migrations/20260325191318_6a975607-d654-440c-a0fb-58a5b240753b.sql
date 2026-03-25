
-- First clean up any duplicate player_index entries
DELETE FROM game_players a
USING game_players b
WHERE a.game_id = b.game_id
  AND a.player_index = b.player_index
  AND a.joined_at > b.joined_at;

-- Clean up duplicate session joins
DELETE FROM game_players a
USING game_players b
WHERE a.game_id = b.game_id
  AND a.session_id = b.session_id
  AND a.joined_at > b.joined_at;

-- Add unique constraints
ALTER TABLE game_players
ADD CONSTRAINT unique_game_player_index UNIQUE (game_id, player_index);

ALTER TABLE game_players
ADD CONSTRAINT unique_game_session UNIQUE (game_id, session_id);

-- Atomic join_game function
CREATE OR REPLACE FUNCTION public.join_game(
  p_game_code TEXT,
  p_player_name TEXT,
  p_session_id TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game RECORD;
  v_existing RECORD;
  v_next_index INTEGER;
  v_current_count INTEGER;
  v_new_player RECORD;
BEGIN
  -- Lock the game row to prevent concurrent modifications
  SELECT * INTO v_game
  FROM games
  WHERE game_code = upper(p_game_code)
  FOR UPDATE;

  IF v_game IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Spelet hittades inte');
  END IF;

  IF v_game.status != 'waiting' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Spelet har redan startat');
  END IF;

  -- Check if already joined
  SELECT * INTO v_existing
  FROM game_players
  WHERE game_id = v_game.id AND session_id = p_session_id;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_joined', true,
      'game_id', v_game.id,
      'game_code', v_game.game_code,
      'player_index', v_existing.player_index
    );
  END IF;

  -- Count current players (safe under FOR UPDATE lock)
  SELECT count(*) INTO v_current_count
  FROM game_players
  WHERE game_id = v_game.id;

  IF v_current_count >= v_game.max_players THEN
    RETURN jsonb_build_object('success', false, 'error', 'Spelet är fullt');
  END IF;

  -- Calculate next index atomically
  SELECT COALESCE(MAX(player_index), -1) + 1 INTO v_next_index
  FROM game_players
  WHERE game_id = v_game.id;

  -- Insert the new player
  INSERT INTO game_players (game_id, player_name, player_index, session_id)
  VALUES (v_game.id, p_player_name, v_next_index, p_session_id)
  RETURNING * INTO v_new_player;

  RETURN jsonb_build_object(
    'success', true,
    'already_joined', false,
    'game_id', v_game.id,
    'game_code', v_game.game_code,
    'player_index', v_new_player.player_index
  );
END;
$$;
