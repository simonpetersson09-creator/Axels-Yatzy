
-- Add forfeited_by column to games table
ALTER TABLE public.games ADD COLUMN forfeited_by text DEFAULT NULL;

-- Update perform_forfeit to store the forfeiting player's name
CREATE OR REPLACE FUNCTION public.perform_forfeit(p_game_id uuid, p_session_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  UPDATE games SET status = 'finished'::game_status, forfeited_by = v_player.player_name
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
$function$;
