
-- Update create_game_with_code to validate player name
CREATE OR REPLACE FUNCTION public.create_game_with_code(p_player_name text, p_session_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code TEXT;
  v_game RECORD;
  v_attempt INTEGER := 0;
  v_max_attempts INTEGER := 10;
  v_clean_name TEXT;
BEGIN
  -- Validate and sanitize name
  v_clean_name := trim(left(p_player_name, 20));
  IF v_clean_name = '' OR v_clean_name IS NULL THEN
    v_clean_name := 'Spelare 1';
  END IF;

  LOOP
    v_attempt := v_attempt + 1;
    IF v_attempt > v_max_attempts THEN
      RETURN jsonb_build_object('success', false, 'error', 'Kunde inte generera unik spelkod');
    END IF;

    v_code := '';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
    END LOOP;

    BEGIN
      INSERT INTO games (game_code)
      VALUES (v_code)
      RETURNING * INTO v_game;

      INSERT INTO game_players (game_id, player_name, player_index, session_id)
      VALUES (v_game.id, v_clean_name, 0, p_session_id);

      RETURN jsonb_build_object(
        'success', true,
        'game_id', v_game.id,
        'game_code', v_game.game_code
      );

    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;
  END LOOP;
END;
$$;

-- Update join_game to validate player name
CREATE OR REPLACE FUNCTION public.join_game(p_game_code text, p_player_name text, p_session_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_game RECORD;
  v_existing RECORD;
  v_next_index INTEGER;
  v_current_count INTEGER;
  v_new_player RECORD;
  v_clean_name TEXT;
BEGIN
  -- Validate and sanitize name
  v_clean_name := trim(left(p_player_name, 20));
  IF v_clean_name = '' OR v_clean_name IS NULL THEN
    v_clean_name := 'Spelare';
  END IF;

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

  SELECT count(*) INTO v_current_count
  FROM game_players
  WHERE game_id = v_game.id;

  IF v_current_count >= v_game.max_players THEN
    RETURN jsonb_build_object('success', false, 'error', 'Spelet är fullt');
  END IF;

  SELECT COALESCE(MAX(player_index), -1) + 1 INTO v_next_index
  FROM game_players
  WHERE game_id = v_game.id;

  INSERT INTO game_players (game_id, player_name, player_index, session_id)
  VALUES (v_game.id, v_clean_name, v_next_index, p_session_id)
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
