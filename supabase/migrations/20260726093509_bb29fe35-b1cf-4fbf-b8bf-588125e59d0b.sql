CREATE OR REPLACE FUNCTION public.record_friend_match(p_game_id uuid, p_session_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_game RECORD;
  v_caller RECORD;
  v_a RECORD;
  v_b RECORD;
  v_p1_total integer := 0;
  v_p2_total integer := 0;
  v_winner_id text;
  v_count integer;
  v_cat text;
  v_val integer;
  v_upper integer;
  v_filled integer := 0;
  v_upper_cats text[] := ARRAY['ones','twos','threes','fours','fives','sixes'];
BEGIN
  SELECT * INTO v_game FROM games WHERE id = p_game_id;
  IF v_game IS NULL OR v_game.status <> 'finished' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Spelet är inte avslutat');
  END IF;

  -- Timed out / cancelled / never accepted matches never enter the statistics
  IF v_game.forfeited_by IN ('Tidsgräns', 'Avbrutet', 'Ej accepterad') THEN
    DELETE FROM friend_match_results WHERE game_id = p_game_id::text;
    RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'Matchen avslutades av tidsgräns');
  END IF;

  -- Forfeited matches (a player left the game) are excluded from statistics:
  -- no loss for the leaver and no win for the opponent.
  IF v_game.forfeited_by IS NOT NULL OR v_game.forfeited_by_session_id IS NOT NULL THEN
    DELETE FROM friend_match_results WHERE game_id = p_game_id::text;
    RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'Matchen avbröts av en spelare');
  END IF;

  SELECT count(*) INTO v_count FROM game_players WHERE game_id = p_game_id;
  IF v_count <> 2 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Endast 2-spelarmatcher stöds');
  END IF;

  SELECT * INTO v_caller FROM game_players
    WHERE game_id = p_game_id AND session_id = p_session_id;
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Du tillhör inte detta spel');
  END IF;

  SELECT * INTO v_a FROM game_players WHERE game_id = p_game_id ORDER BY player_index ASC LIMIT 1;
  SELECT * INTO v_b FROM game_players WHERE game_id = p_game_id ORDER BY player_index DESC LIMIT 1;

  SELECT count(*) INTO v_filled
  FROM (
    SELECT key FROM jsonb_each_text(v_a.scores) WHERE NULLIF(value, 'null') IS NOT NULL
    UNION ALL
    SELECT key FROM jsonb_each_text(v_b.scores) WHERE NULLIF(value, 'null') IS NOT NULL
  ) s;

  IF v_filled = 0 THEN
    DELETE FROM friend_match_results WHERE game_id = p_game_id::text;
    RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'Matchen spelades aldrig');
  END IF;

  v_upper := 0;
  FOR v_cat, v_val IN
    SELECT key, NULLIF(value, 'null')::int FROM jsonb_each_text(v_a.scores)
  LOOP
    IF v_val IS NOT NULL THEN
      v_p1_total := v_p1_total + v_val;
      IF v_cat = ANY(v_upper_cats) THEN v_upper := v_upper + v_val; END IF;
    END IF;
  END LOOP;
  IF v_upper >= 63 THEN v_p1_total := v_p1_total + 50; END IF;

  v_upper := 0;
  FOR v_cat, v_val IN
    SELECT key, NULLIF(value, 'null')::int FROM jsonb_each_text(v_b.scores)
  LOOP
    IF v_val IS NOT NULL THEN
      v_p2_total := v_p2_total + v_val;
      IF v_cat = ANY(v_upper_cats) THEN v_upper := v_upper + v_val; END IF;
    END IF;
  END LOOP;
  IF v_upper >= 63 THEN v_p2_total := v_p2_total + 50; END IF;

  IF v_p1_total > v_p2_total THEN v_winner_id := v_a.session_id;
  ELSIF v_p2_total > v_p1_total THEN v_winner_id := v_b.session_id;
  ELSE v_winner_id := NULL;
  END IF;

  INSERT INTO friend_match_results (
    game_id, game_mode, status, finished_at,
    player_1_id, player_1_name, player_1_score,
    player_2_id, player_2_name, player_2_score,
    winner_id
  ) VALUES (
    p_game_id::text, 'multiplayer', 'finished', now(),
    v_a.session_id, v_a.player_name, v_p1_total,
    v_b.session_id, v_b.player_name, v_p2_total,
    v_winner_id
  )
  ON CONFLICT (game_id) DO UPDATE SET
    status = 'finished',
    finished_at = now(),
    player_1_id = EXCLUDED.player_1_id,
    player_1_name = EXCLUDED.player_1_name,
    player_1_score = EXCLUDED.player_1_score,
    player_2_id = EXCLUDED.player_2_id,
    player_2_name = EXCLUDED.player_2_name,
    player_2_score = EXCLUDED.player_2_score,
    winner_id = EXCLUDED.winner_id;

  RETURN jsonb_build_object('success', true);
END;
$function$;