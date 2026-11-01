CREATE TABLE public.weekly_game_completions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 session_id text NOT NULL REFERENCES public.session_owners(session_id) ON DELETE CASCADE,
 completed_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.weekly_game_completions TO service_role;
ALTER TABLE public.weekly_game_completions ENABLE ROW LEVEL SECURITY;
CREATE INDEX weekly_game_completions_session_time_idx ON public.weekly_game_completions(session_id,completed_at);
CREATE TABLE public.weekly_game_tracking (id integer PRIMARY KEY CHECK(id=1), started_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.weekly_game_tracking TO service_role;
ALTER TABLE public.weekly_game_tracking ENABLE ROW LEVEL SECURITY;
-- Additive backfill records coverage start only, never estimates historical match counts.
INSERT INTO public.weekly_game_tracking(id) VALUES(1);
CREATE OR REPLACE FUNCTION public.internal_log_weekly_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
 IF TG_OP='INSERT' OR NEW.games_played>OLD.games_played THEN
  INSERT INTO public.weekly_game_completions(session_id) VALUES(NEW.session_id);
 END IF;
 RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION public.internal_log_weekly_completion() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER weekly_completion_log AFTER INSERT OR UPDATE ON public.weekly_hall_of_fame FOR EACH ROW EXECUTE FUNCTION public.internal_log_weekly_completion();
CREATE OR REPLACE FUNCTION public.get_weekly_games_24h(p_session_ids text[])
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
 SELECT coalesce(jsonb_agg(jsonb_build_object('session_id',s.session_id,'games_24h',CASE WHEN now() >= (SELECT started_at FROM public.weekly_game_tracking WHERE id=1)+interval '24 hours' THEN (SELECT count(*) FROM public.weekly_game_completions c WHERE c.session_id=s.session_id AND c.completed_at>now()-interval '24 hours' AND c.completed_at<=now()) ELSE NULL END)), '[]'::jsonb)
 FROM (SELECT DISTINCT unnest(p_session_ids[1:50]) AS session_id) s;
$function$;
REVOKE ALL ON FUNCTION public.get_weekly_games_24h(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_weekly_games_24h(text[]) TO anon,authenticated,service_role;
COMMENT ON TABLE public.weekly_game_completions IS 'Timestamped accepted completed-game reports; separate from unchanged weekly totals/ranks. Deleted with device-owned sessions.';