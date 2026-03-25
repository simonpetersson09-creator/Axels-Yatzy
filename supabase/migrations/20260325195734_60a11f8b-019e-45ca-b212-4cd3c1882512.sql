
-- Add last_active_at to game_players for presence/heartbeat tracking
ALTER TABLE public.game_players ADD COLUMN last_active_at timestamptz NOT NULL DEFAULT now();

-- RPC to update heartbeat
CREATE OR REPLACE FUNCTION public.heartbeat(p_game_id uuid, p_session_id text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE game_players
  SET last_active_at = now()
  WHERE game_id = p_game_id AND session_id = p_session_id;
$$;

-- RPC to skip inactive player's turn (called by any active player or a cron)
CREATE OR REPLACE FUNCTION public.skip_inactive_turn(p_game_id uuid, p_timeout_seconds integer DEFAULT 60)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_game RECORD;
  v_current_player RECORD;
  v_player_count integer;
  v_next_index integer;
BEGIN
  SELECT * INTO v_game FROM games WHERE id = p_game_id FOR UPDATE;
  
  IF v_game IS NULL OR v_game.status != 'playing' THEN
    RETURN jsonb_build_object('skipped', false, 'reason', 'Spelet är inte aktivt');
  END IF;

  -- Find the current player
  SELECT * INTO v_current_player
  FROM game_players
  WHERE game_id = p_game_id AND player_index = v_game.current_player_index;

  IF v_current_player IS NULL THEN
    RETURN jsonb_build_object('skipped', false, 'reason', 'Spelare hittades inte');
  END IF;

  -- Check if they are actually inactive
  IF v_current_player.last_active_at > now() - (p_timeout_seconds || ' seconds')::interval THEN
    RETURN jsonb_build_object('skipped', false, 'reason', 'Spelaren är fortfarande aktiv');
  END IF;

  -- Skip their turn
  SELECT count(*) INTO v_player_count FROM game_players WHERE game_id = p_game_id;
  v_next_index := (v_game.current_player_index + 1) % v_player_count;

  UPDATE games
  SET current_player_index = v_next_index,
      dice = ARRAY[1,1,1,1,1],
      locked_dice = ARRAY[false,false,false,false,false],
      rolls_left = 3,
      is_rolling = false,
      round = CASE WHEN v_next_index = 0 THEN v_game.round + 1 ELSE v_game.round END
  WHERE id = p_game_id;

  RETURN jsonb_build_object('skipped', true, 'skipped_player', v_current_player.player_name, 'next_index', v_next_index);
END;
$$;
