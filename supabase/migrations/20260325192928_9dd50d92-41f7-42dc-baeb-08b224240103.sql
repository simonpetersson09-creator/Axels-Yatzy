
-- Trigger to enforce max_players at the database level
-- This is a safety net in case someone bypasses the RPC
CREATE OR REPLACE FUNCTION public.enforce_max_players()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max INTEGER;
  v_current INTEGER;
BEGIN
  SELECT max_players INTO v_max FROM games WHERE id = NEW.game_id;
  
  SELECT count(*) INTO v_current FROM game_players WHERE game_id = NEW.game_id;
  
  IF v_current >= v_max THEN
    RAISE EXCEPTION 'Spelet är fullt (max % spelare)', v_max;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_max_players
  BEFORE INSERT ON game_players
  FOR EACH ROW
  EXECUTE FUNCTION enforce_max_players();
