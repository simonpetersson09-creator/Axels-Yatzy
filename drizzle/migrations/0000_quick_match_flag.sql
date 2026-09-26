ALTER TABLE public.games ADD COLUMN IF NOT EXISTS is_quick_match boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.find_or_join_match(p_session_id text, p_player_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_name text;
  v_own RECORD;
  v_other RECORD;
  v_game RECORD;
  v_code text;
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_attempt int := 0;
  v_active int;
BEGIN
  IF p_session_id IS NULL OR length(p_session_id) < 8 OR length(p_session_id) > 64 THEN
    RETURN jsonb_build_object('status', 'error', 'error', 'invalid session');
  END IF;
  v_name := trim(left(coalesce(p_player_name, ''), 20));
  IF v_name = '' THEN v_name := 'Spelare'; END IF;

  DELETE FROM matchmaking_queue
  WHERE matched_game_id IS NULL AND updated_at < now() - interval '30 seconds';
  DELETE FROM matchmaking_queue
  WHERE matched_game_id IS NOT NULL AND updated_at < now() - interval '5 minutes';

  SELECT * INTO v_own FROM matchmaking_queue WHERE session_id = p_session_id;
  IF v_own IS NOT NULL AND v_own.matched_game_id IS NOT NULL THEN
    DELETE FROM matchmaking_queue WHERE session_id = p_session_id;
    RETURN jsonb_build_object('status', 'matched', 'game_id', v_own.matched_game_id);
  END IF;

  SELECT count(*) INTO v_active
  FROM games g JOIN game_players gp ON gp.game_id = g.id
  WHERE gp.session_id = p_session_id AND g.status IN ('waiting','playing');
  IF v_active >= 3 THEN
    DELETE FROM matchmaking_queue WHERE session_id = p_session_id;
    RETURN jsonb_build_object('status', 'error', 'error', 'too_many_games');
  END IF;

  SELECT * INTO v_other FROM matchmaking_queue
  WHERE matched_game_id IS NULL
    AND session_id <> p_session_id
    AND updated_at > now() - interval '6 seconds'
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_other IS NULL THEN
    INSERT INTO matchmaking_queue (session_id, player_name)
    VALUES (p_session_id, v_name)
    ON CONFLICT (session_id) DO UPDATE SET player_name = EXCLUDED.player_name, updated_at = now();
    RETURN jsonb_build_object('status', 'waiting');
  END IF;

  LOOP
    v_attempt := v_attempt + 1;
    IF v_attempt > 10 THEN
      RETURN jsonb_build_object('status', 'error', 'error', 'code');
    END IF;
    v_code := '';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
    END LOOP;
    BEGIN
      INSERT INTO games (game_code, status, max_players, is_quick_match)
      VALUES (v_code, 'playing', 2, true)
      RETURNING * INTO v_game;
      EXIT;
    EXCEPTION WHEN unique_violation THEN CONTINUE; END;
  END LOOP;

  INSERT INTO game_players (game_id, player_name, player_index, session_id)
  VALUES
    (v_game.id, v_other.player_name, 0, v_other.session_id),
    (v_game.id, v_name, 1, p_session_id);

  UPDATE matchmaking_queue SET matched_game_id = v_game.id, updated_at = now()
  WHERE session_id = v_other.session_id;
  DELETE FROM matchmaking_queue WHERE session_id = p_session_id;

  RETURN jsonb_build_object('status', 'matched', 'game_id', v_game.id);
END;
$function$;