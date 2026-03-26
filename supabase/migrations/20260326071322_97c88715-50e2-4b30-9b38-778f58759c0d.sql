
CREATE OR REPLACE FUNCTION public.create_game_with_code(p_player_name text, p_session_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code TEXT;
  v_game RECORD;
  v_attempt INTEGER := 0;
  v_max_attempts INTEGER := 10;
  v_clean_name TEXT;
BEGIN
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
        'game_code', v_game.game_code,
        'player_index', 0
      );

    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;
  END LOOP;
END;
$function$;
