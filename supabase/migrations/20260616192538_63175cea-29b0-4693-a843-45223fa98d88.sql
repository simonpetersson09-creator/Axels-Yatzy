
-- 1. Add status + finished_at, allow NULL scores for ongoing rows
ALTER TABLE public.friend_match_results
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'finished',
  ADD COLUMN IF NOT EXISTS finished_at timestamptz;

ALTER TABLE public.friend_match_results
  ALTER COLUMN player_1_score DROP NOT NULL,
  ALTER COLUMN player_2_score DROP NOT NULL;

-- Backfill existing rows
UPDATE public.friend_match_results
  SET finished_at = COALESCE(finished_at, created_at)
  WHERE status = 'finished' AND finished_at IS NULL;

-- Constrain status values
ALTER TABLE public.friend_match_results
  DROP CONSTRAINT IF EXISTS friend_match_results_status_check;
ALTER TABLE public.friend_match_results
  ADD CONSTRAINT friend_match_results_status_check
  CHECK (status IN ('ongoing','finished'));

-- 2. Replace record_friend_match to UPSERT finished result
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

  SELECT * INTO v_a FROM game_players WHERE game_id = p_game_id ORDER BY session_id ASC LIMIT 1;
  SELECT * INTO v_b FROM game_players WHERE game_id = p_game_id ORDER BY session_id DESC LIMIT 1;

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

  IF v_game.forfeited_by IS NOT NULL THEN
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
    player_1_name = EXCLUDED.player_1_name,
    player_1_score = EXCLUDED.player_1_score,
    player_2_name = EXCLUDED.player_2_name,
    player_2_score = EXCLUDED.player_2_score,
    winner_id = EXCLUDED.winner_id;

  RETURN jsonb_build_object('success', true);
END;
$function$;

-- 3. Trigger function: create an ongoing friend-match row as soon as a 2-player
--    match goes live (covers both lobby start and invite-accept paths).
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

  SELECT * INTO v_a FROM game_players WHERE game_id = p_game_id ORDER BY session_id ASC LIMIT 1;
  SELECT * INTO v_b FROM game_players WHERE game_id = p_game_id ORDER BY session_id DESC LIMIT 1;
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

-- Trigger on games: status flips to 'playing' (lobby start path)
CREATE OR REPLACE FUNCTION public.trg_games_ongoing_match()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'playing' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'playing') THEN
    PERFORM public.maybe_create_ongoing_friend_match(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_games_create_ongoing_match ON public.games;
CREATE TRIGGER trg_games_create_ongoing_match
AFTER INSERT OR UPDATE OF status ON public.games
FOR EACH ROW EXECUTE FUNCTION public.trg_games_ongoing_match();

-- Trigger on game_players: invite-accept path inserts game as 'playing' then
-- adds two players; this fires once the second player is inserted.
CREATE OR REPLACE FUNCTION public.trg_players_ongoing_match()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.maybe_create_ongoing_friend_match(NEW.game_id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_game_players_create_ongoing_match ON public.game_players;
CREATE TRIGGER trg_game_players_create_ongoing_match
AFTER INSERT ON public.game_players
FOR EACH ROW EXECUTE FUNCTION public.trg_players_ongoing_match();

-- 4. Realtime
ALTER TABLE public.friend_match_results REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'friend_match_results'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.friend_match_results;
  END IF;
END $$;
