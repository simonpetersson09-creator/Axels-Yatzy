CREATE TABLE public.dice_roll_log (
  id bigserial PRIMARY KEY,
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  round integer NOT NULL,
  player_index integer NOT NULL,
  roll_no integer NOT NULL,
  dice integer[] NOT NULL,
  locked boolean[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.dice_roll_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.dice_roll_log_id_seq TO service_role;
ALTER TABLE public.dice_roll_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages dice roll log" ON public.dice_roll_log FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX dice_roll_log_game_idx ON public.dice_roll_log(game_id, created_at);

CREATE OR REPLACE FUNCTION public.trg_log_dice_roll()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.rolls_left < OLD.rolls_left
     AND NEW.round = OLD.round
     AND NEW.current_player_index = OLD.current_player_index THEN
    INSERT INTO public.dice_roll_log(game_id, round, player_index, roll_no, dice, locked)
    VALUES (NEW.id, NEW.round, NEW.current_player_index, 3 - NEW.rolls_left, NEW.dice, OLD.locked_dice);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW; -- logging must never block a roll
END;
$$;
REVOKE EXECUTE ON FUNCTION public.trg_log_dice_roll() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER games_log_dice_roll AFTER UPDATE OF rolls_left ON public.games
FOR EACH ROW EXECUTE FUNCTION public.trg_log_dice_roll();