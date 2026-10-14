CREATE OR REPLACE FUNCTION public.find_or_join_match(p_session_id text, p_player_name text, p_players integer DEFAULT 2)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_name text;
  v_size int := least(greatest(coalesce(p_players, 2), 2), 4);
  v_own RECORD;
  v_sessions text[];
  v_names text[];
  v_active int;
  v_game_id uuid;
  v_num text;
BEGIN
  IF p_session_id IS NULL OR length(p_session_id) < 8 OR length(p_session_id) > 64 OR p_session_id LIKE 'bot:%' THEN
    RETURN jsonb_build_object('status', 'error', 'error', 'invalid session');
  END IF;
  v_name := trim(left(coalesce(p_player_name, ''), 20));
  -- No real name (empty or the app's "you" word) → stable "Spelare 4832".
  v_num := (1000 + abs(hashtext(p_session_id)) % 9000)::text;
  IF v_name = '' OR v_name IN ('Spelare','Du','Sinä','You','Tu','Tú','Ty','Te','Ti','Sen','Jij','Vous','Você','Bạn','Kamu','Awak','Ты','Ти','Εσύ','나','あなた','คุณ','तुम','तू','তুমি','ਤੁਸੀਂ','ତୁମେ','நீங்கள்','તમે','ನೀನು','നിങ്ങൾ','నువ్వు') THEN
    v_name := CASE WHEN v_name IN ('Spelare','Du','Sinä') THEN 'Spelare ' ELSE 'Player ' END || v_num;
  END IF;

  DELETE FROM matchmaking_queue WHERE matched_game_id IS NULL AND updated_at < now() - interval '30 seconds';
  DELETE FROM matchmaking_queue WHERE matched_game_id IS NOT NULL AND updated_at < now() - interval '5 minutes';

  SELECT count(*) INTO v_active
  FROM games g JOIN game_players gp ON gp.game_id = g.id
  WHERE gp.session_id = p_session_id AND g.status IN ('waiting','playing');

  INSERT INTO matchmaking_queue (session_id, player_name, wanted_players)
  VALUES (p_session_id, v_name, v_size)
  ON CONFLICT (session_id) DO UPDATE
    SET player_name = EXCLUDED.player_name, wanted_players = EXCLUDED.wanted_players, updated_at = now();

  SELECT * INTO v_own FROM matchmaking_queue WHERE session_id = p_session_id;
  IF v_own.matched_game_id IS NOT NULL THEN
    DELETE FROM matchmaking_queue WHERE session_id = p_session_id;
    RETURN jsonb_build_object('status', 'matched', 'game_id', v_own.matched_game_id);
  END IF;

  IF v_active >= 3 THEN
    DELETE FROM matchmaking_queue WHERE session_id = p_session_id;
    RETURN jsonb_build_object('status', 'error', 'error', 'too_many_games');
  END IF;

  SELECT array_agg(session_id ORDER BY created_at), array_agg(player_name ORDER BY created_at)
  INTO v_sessions, v_names
  FROM (
    SELECT session_id, player_name, created_at FROM matchmaking_queue
    WHERE matched_game_id IS NULL AND session_id <> p_session_id
      AND wanted_players = v_size AND updated_at > now() - interval '6 seconds'
    ORDER BY created_at
    LIMIT v_size - 1
    FOR UPDATE SKIP LOCKED
  ) q;

  IF coalesce(array_length(v_sessions, 1), 0) < v_size - 1 THEN
    RETURN jsonb_build_object('status', 'waiting', 'searching', coalesce(array_length(v_sessions, 1), 0) + 1);
  END IF;

  v_game_id := public.internal_create_quick_match(v_sessions || p_session_id, v_names || v_name, v_size);
  UPDATE matchmaking_queue SET matched_game_id = v_game_id, updated_at = now() WHERE session_id = ANY(v_sessions);
  DELETE FROM matchmaking_queue WHERE session_id = p_session_id;
  RETURN jsonb_build_object('status', 'matched', 'game_id', v_game_id);
END;
$function$;