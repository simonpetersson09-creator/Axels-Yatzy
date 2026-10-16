CREATE TABLE public.lobby_join_queue (
  id bigserial PRIMARY KEY,
  game_id uuid NOT NULL,
  session_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.lobby_join_queue TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.lobby_join_queue_id_seq TO service_role;
ALTER TABLE public.lobby_join_queue ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.trg_notify_lobby_join()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.player_index > 0 AND EXISTS (SELECT 1 FROM public.games g WHERE g.id = NEW.game_id AND g.status = 'waiting') THEN
    BEGIN
      INSERT INTO public.lobby_join_queue (game_id, session_id) VALUES (NEW.game_id, NEW.session_id::text);
      PERFORM net.http_post(
        url := 'https://ixzqnmocplgbsawuufsm.supabase.co/functions/v1/notify-lobby-join',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := '{}'::jsonb
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.trg_notify_lobby_join() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS notify_lobby_join ON public.game_players;
CREATE TRIGGER notify_lobby_join AFTER INSERT ON public.game_players
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_lobby_join();