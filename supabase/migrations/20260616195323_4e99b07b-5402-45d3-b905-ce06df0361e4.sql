-- 1. Add stable forfeit identifier
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS forfeited_by_session_id text;

-- 2. Best-effort backfill from existing name-based forfeits
UPDATE public.games g
SET forfeited_by_session_id = gp.session_id
FROM public.game_players gp
WHERE g.forfeited_by_session_id IS NULL
  AND g.forfeited_by IS NOT NULL
  AND gp.game_id = g.id
  AND gp.player_name = g.forfeited_by;

-- 3. perform_forfeit — record session id alongside the name
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

-- 4. maybe_create_ongoing_friend_match — order by player_index, not session_id
CREATE OR REPLACE FUNCTION public.maybe_create_ongoing_friend_match(p_game_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status game_status;
  v_count integer;
  v_a RECORD;
  v_b RECORD;
BEGIN
  SELECT status INTO v_status FROM games WHERE id = p_game_id;
  IF v_status <> 'playing' THEN RETURN; END IF;
  SELECT count(*) INTO v_count FROM game_players WHERE game_id = p_game_id;
  IF v_count <> 2 THEN RETURN; END IF;

  SELECT * INTO v_a FROM game_players WHERE game_id = p_game_id ORDER BY player_index ASC LIMIT 1;
  SELECT * INTO v_b FROM game_players WHERE game_id = p_game_id ORDER BY player_index DESC LIMIT 1;
  IF v_a.session_id = v_b.session_id THEN RETURN; END IF;

  INSERT INTO friend_match_results (
    game_id, game_mode, status,
    player_1_id, player_1_name, player_1_score,
    player_2_id, player_2_name, player_2_score,
    winner_id
  ) VALUES (
    p_game_id::text, 'multiplayer', 'ongoing',
    v_a.session_id, v_a.player_name, NULL,
    v_b.session_id, v_b.player_name, NULL,
    NULL
  )
  ON CONFLICT (game_id) DO NOTHING;
END;
$function$;

-- 5. record_friend_match — order by player_index and use session id for forfeit winner
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
  v_upper_cats text[] := ARRAY['ones','twos','threes','fours','fives','sixes'];
BEGIN
  SELECT * INTO v_game FROM games WHERE id = p_game_id;
  IF v_game IS NULL OR v_game.status <> 'finished' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Spelet är inte avslutat');
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

  IF v_game.forfeited_by_session_id IS NOT NULL THEN
    -- Prefer the stable session id when present
    IF v_a.session_id = v_game.forfeited_by_session_id THEN v_winner_id := v_b.session_id;
    ELSE v_winner_id := v_a.session_id; END IF;
  ELSIF v_game.forfeited_by IS NOT NULL THEN
    -- Legacy fallback for rows recorded before the session id was tracked
    IF v_a.player_name = v_game.forfeited_by THEN v_winner_id := v_b.session_id;
    ELSE v_winner_id := v_a.session_id; END IF;
  ELSIF v_p1_total > v_p2_total THEN v_winner_id := v_a.session_id;
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