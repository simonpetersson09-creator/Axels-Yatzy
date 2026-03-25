
-- Unique index only on non-finished games (active game codes must be unique)
CREATE UNIQUE INDEX unique_active_game_code 
ON games (game_code) 
WHERE status IN ('waiting', 'playing');

-- Atomic game creation with retry on collision
CREATE OR REPLACE FUNCTION public.create_game_with_code(
  p_player_name TEXT,
  p_session_id TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code TEXT;
  v_game RECORD;
  v_attempt INTEGER := 0;
  v_max_attempts INTEGER := 10;
BEGIN
  LOOP
    v_attempt := v_attempt + 1;
    IF v_attempt > v_max_attempts THEN
      RETURN jsonb_build_object('success', false, 'error', 'Kunde inte generera unik spelkod');
    END IF;

    -- Generate 6-char code
    v_code := '';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
    END LOOP;

    BEGIN
      INSERT INTO games (game_code)
      VALUES (v_code)
      RETURNING * INTO v_game;

      -- Success — now add the host player
      INSERT INTO game_players (game_id, player_name, player_index, session_id)
      VALUES (v_game.id, p_player_name, 0, p_session_id);

      RETURN jsonb_build_object(
        'success', true,
        'game_id', v_game.id,
        'game_code', v_game.game_code
      );

    EXCEPTION WHEN unique_violation THEN
      -- Code collision on active game, retry
      CONTINUE;
    END;
  END LOOP;
END;
$$;
