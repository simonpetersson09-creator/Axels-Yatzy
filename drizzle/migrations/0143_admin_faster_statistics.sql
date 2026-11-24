-- Pure scalar helper: no tables, schemas or external calls. Removing the
-- search_path fence permits SQL inlining without changing its predicate.
ALTER FUNCTION public.admin_is_app_activity_event(text) RESET search_path;
-- Avoid costly JIT preparation for this multi-part reporting query only.
ALTER FUNCTION public.admin_daily_stats_v8(date) SET jit TO 'off';

-- Materialize only events and columns actually consumed by extra counters.
-- Retain full history for first play and match-exit deduplication.
DO $migration$
DECLARE definition text; original text; optimized text;
BEGIN
 definition := pg_get_functiondef('public.admin_daily_extra_stats(date)'::regprocedure);
 original := 'SELECT e.* FROM analytics_events e WHERE platform IN (''ios'',''android'') AND device_id IS NOT NULL';
 optimized := 'SELECT e.id,e.device_id,e.created_at,e.event_name,e.metadata,e.app_version FROM analytics_events e WHERE e.event_name IN (''game_started'',''quick_match_started'',''game_finished'',''quick_match_online_matched'',''mp_issue'',''post_match_exit'') AND platform IN (''ios'',''android'') AND device_id IS NOT NULL';
 IF position(original IN definition) > 0 THEN
  EXECUTE replace(definition,original,optimized);
 ELSIF position(optimized IN definition) = 0 THEN
  RAISE EXCEPTION 'Unexpected admin extra-statistics source; refusing to change counters';
 END IF;
END $migration$;
REVOKE ALL ON FUNCTION public.admin_daily_stats_v8(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_daily_stats_v8(date) TO service_role;
REVOKE ALL ON FUNCTION public.admin_daily_extra_stats(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_daily_extra_stats(date) TO service_role;