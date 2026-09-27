ALTER TABLE public.game_players ADD COLUMN IF NOT EXISTS is_bot boolean NOT NULL DEFAULT false;
ALTER TABLE public.matchmaking_queue ADD COLUMN IF NOT EXISTS wanted_players integer NOT NULL DEFAULT 2;

-- Online quick matches never enter the friend statistics / friend list.
CREATE OR REPLACE FUNCTION public.trg_skip_quick_match_friend_result()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM games WHERE id::text = NEW.game_id AND is_quick_match) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS skip_quick_match_friend_result ON public.friend_match_results;
CREATE TRIGGER skip_quick_match_friend_result BEFORE INSERT ON public.friend_match_results
FOR EACH ROW EXECUTE FUNCTION public.trg_skip_quick_match_friend_result();

CREATE OR REPLACE FUNCTION public.internal_create_quick_match(p_sessions text[], p_names text[], p_size integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_game_id uuid;
  v_code text;
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_attempt int := 0;
  v_humans int := coalesce(array_length(p_sessions, 1), 0);
  v_bot_names text[];
  i int;
BEGIN
  LOOP
    v_attempt := v_attempt + 1;
    IF v_attempt > 10 THEN RAISE EXCEPTION 'could not create game code'; END IF;
    v_code := '';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
    END LOOP;
    BEGIN
      INSERT INTO games (game_code, status, max_players, is_quick_match)
      VALUES (v_code, 'playing', p_size, true)
      RETURNING id INTO v_game_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN CONTINUE; END;
  END LOOP;

  FOR i IN 1..v_humans LOOP
    INSERT INTO game_players (game_id, player_name, player_index, session_id)
    VALUES (v_game_id, p_names[i], i - 1, p_sessions[i]);
  END LOOP;

  SELECT array_agg(n ORDER BY random()) INTO v_bot_names
  FROM unnest(ARRAY['Astrid','Björn','Elsa','Gustav','Ingrid','Lars','Maja','Nils','Sigrid','Oskar']) AS n
  WHERE n <> ALL (p_names);

  FOR i IN (v_humans + 1)..p_size LOOP
    INSERT INTO game_players (game_id, player_name, player_index, session_id, is_bot, last_active_at)
    VALUES (v_game_id, v_bot_names[i - v_humans], i - 1, 'bot:' || gen_random_uuid()::text, true, now() - interval '1 day');
  END LOOP;

  RETURN v_game_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.internal_create_quick_match(text[], text[], integer) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.find_or_join_match(text, text);

CREATE OR REPLACE FUNCTION public.find_or_join_match(p_session_id text, p_player_name text, p_players integer DEFAULT 2)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_name text;
  v_size int := least(greatest(coalesce(p_players, 2), 2), 4);
  v_own RECORD;
  v_sessions text[];
  v_names text[];
  v_active int;
  v_game_id uuid;
BEGIN
  IF p_session_id IS NULL OR length(p_session_id) < 8 OR length(p_session_id) > 64 OR p_session_id LIKE 'bot:%' THEN
    RETURN jsonb_build_object('status', 'error', 'error', 'invalid session');
  END IF;
  v_name := trim(left(coalesce(p_player_name, ''), 20));
  IF v_name = '' THEN v_name := 'Spelare'; END IF;

  DELETE FROM matchmaking_queue WHERE matched_game_id IS NULL AND updated_at < now() - interval '30 seconds';
  DELETE FROM matchmaking_queue WHERE matched_game_id IS NOT NULL AND updated_at < now() - interval '5 minutes';

  SELECT count(*) INTO v_active
  FROM games g JOIN game_players gp ON gp.game_id = g.id
  WHERE gp.session_id = p_session_id AND g.status IN ('waiting','playing');

  -- Upsert locks our own row for the rest of the transaction.
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
$$;

-- Called when the search times out: start with whoever is waiting and fill the rest with the computer.
CREATE OR REPLACE FUNCTION public.finalize_matchmaking(p_session_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_own RECORD;
  v_sessions text[];
  v_names text[];
  v_game_id uuid;
BEGIN
  SELECT * INTO v_own FROM matchmaking_queue WHERE session_id = p_session_id FOR UPDATE;
  IF v_own IS NULL THEN RETURN jsonb_build_object('status', 'left'); END IF;
  IF v_own.matched_game_id IS NOT NULL THEN
    DELETE FROM matchmaking_queue WHERE session_id = p_session_id;
    RETURN jsonb_build_object('status', 'matched', 'game_id', v_own.matched_game_id);
  END IF;

  SELECT array_agg(session_id ORDER BY created_at), array_agg(player_name ORDER BY created_at)
  INTO v_sessions, v_names
  FROM (
    SELECT session_id, player_name, created_at FROM matchmaking_queue
    WHERE matched_game_id IS NULL AND session_id <> p_session_id
      AND wanted_players = v_own.wanted_players AND updated_at > now() - interval '6 seconds'
    ORDER BY created_at
    LIMIT v_own.wanted_players - 1
    FOR UPDATE SKIP LOCKED
  ) q;

  IF coalesce(array_length(v_sessions, 1), 0) = 0 THEN
    DELETE FROM matchmaking_queue WHERE session_id = p_session_id;
    RETURN jsonb_build_object('status', 'left');
  END IF;

  v_game_id := public.internal_create_quick_match(v_sessions || p_session_id, v_names || v_own.player_name, v_own.wanted_players);
  UPDATE matchmaking_queue SET matched_game_id = v_game_id, updated_at = now() WHERE session_id = ANY(v_sessions);
  DELETE FROM matchmaking_queue WHERE session_id = p_session_id;
  RETURN jsonb_build_object('status', 'matched', 'game_id', v_game_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_or_join_match(text, text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_matchmaking(text) TO anon, authenticated;