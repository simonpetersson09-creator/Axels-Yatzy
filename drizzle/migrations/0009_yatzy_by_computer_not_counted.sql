-- A Yatzy scored by the computer on behalf of an absent player (quick-match takeover)
-- never counts toward permanent dice tiers. Takeover only happens after 60 s of
-- silence; present players heartbeat every 15 s, so 45 s is a safe threshold.
ALTER TABLE public.game_players ADD COLUMN IF NOT EXISTS yatzy_by_computer boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.trg_mark_computer_yatzy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT NEW.is_bot
     AND (NEW.scores->>'yatzy') = '50'
     AND (OLD.scores->>'yatzy') IS NULL
     AND OLD.last_active_at < now() - interval '45 seconds' THEN
    NEW.yatzy_by_computer := true;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_mark_computer_yatzy BEFORE UPDATE OF scores ON public.game_players
FOR EACH ROW EXECUTE FUNCTION public.trg_mark_computer_yatzy();

CREATE OR REPLACE FUNCTION public.trg_yatzy_on_finish()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record;
BEGIN
  IF NEW.status <> 'finished' OR OLD.status = 'finished' OR NEW.forfeited_by IS NOT NULL THEN RETURN NEW; END IF;
  FOR r IN SELECT session_id FROM game_players
            WHERE game_id = NEW.id AND NOT is_bot AND NOT yatzy_by_computer AND (scores->>'yatzy') = '50' LOOP
    PERFORM internal_add_yatzy_match(r.session_id, 'mp:' || NEW.id::text);
  END LOOP;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.trg_mark_computer_yatzy() FROM PUBLIC, anon, authenticated;