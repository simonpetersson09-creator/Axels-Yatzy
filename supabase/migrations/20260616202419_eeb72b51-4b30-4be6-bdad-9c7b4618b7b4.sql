
CREATE OR REPLACE FUNCTION public.internal_record_friend_match(p_game_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_any_session text;
BEGIN
  SELECT session_id INTO v_any_session FROM game_players WHERE game_id = p_game_id LIMIT 1;
  IF v_any_session IS NULL THEN RETURN; END IF;
  PERFORM public.record_friend_match(p_game_id, v_any_session);
EXCEPTION WHEN OTHERS THEN
  -- Never block the originating UPDATE on games
  RAISE WARNING 'internal_record_friend_match failed: %', SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_games_finished_record_match()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NEW.status = 'finished' AND (OLD.status IS DISTINCT FROM 'finished') THEN
    SELECT count(*) INTO v_count FROM game_players WHERE game_id = NEW.id;
    IF v_count = 2 THEN
      PERFORM public.internal_record_friend_match(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS games_finished_record_match ON public.games;
CREATE TRIGGER games_finished_record_match
AFTER UPDATE OF status ON public.games
FOR EACH ROW
EXECUTE FUNCTION public.trg_games_finished_record_match();
