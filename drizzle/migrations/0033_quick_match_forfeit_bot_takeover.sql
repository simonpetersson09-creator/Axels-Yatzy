CREATE OR REPLACE FUNCTION public.perform_forfeit(p_game_id uuid, p_session_id text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_game RECORD;
  v_player RECORD;
  v_update_count integer;
  v_bot_name text;
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

  -- Quick match, early leave (round 1-2) and another human still in the game:
  -- a computer player takes the seat so the others can finish the match.
  IF v_game.is_quick_match AND v_game.round <= 2 AND NOT v_player.is_bot AND EXISTS (
       SELECT 1 FROM game_players WHERE game_id = p_game_id AND NOT is_bot AND session_id <> p_session_id) THEN
    SELECT n INTO v_bot_name
    FROM unnest(ARRAY['Astrid','Björn','Elsa','Gustav','Ingrid','Lars','Maja','Nils','Sigrid','Oskar']) AS n
    WHERE n NOT IN (SELECT player_name FROM game_players WHERE game_id = p_game_id)
    ORDER BY random() LIMIT 1;

    UPDATE game_players
    SET is_bot = true,
        session_id = 'bot:' || gen_random_uuid()::text,
        player_name = coalesce(v_bot_name, 'Astrid'),
        away = false,
        last_active_at = now() - interval '1 day'
    WHERE id = v_player.id;

    UPDATE games SET updated_at = now() WHERE id = p_game_id;

    RETURN jsonb_build_object(
      'success', true,
      'game_ended', false,
      'replaced_by_bot', true,
      'forfeited_player', v_player.player_name,
      'forfeited_player_index', v_player.player_index
    );
  END IF;

  UPDATE games
  SET status = 'finished'::game_status,
      forfeited_by = v_player.player_name,
      forfeited_by_session_id = v_player.session_id
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