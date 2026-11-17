DO $migration$
DECLARE target text; definition text; updated text;
BEGIN
 FOREACH target IN ARRAY ARRAY['public.admin_daily_stats_v3(date)', 'public.admin_daily_extra_stats(date)'] LOOP
  definition := pg_get_functiondef(target::regprocedure);
  updated := regexp_replace(definition, 'ORDER BY release DESC LIMIT 2', 'ORDER BY release DESC LIMIT 1', 'i');
  IF updated = definition THEN RAISE EXCEPTION 'Expected latest release lookup missing in %', target; END IF;
  EXECUTE updated;
 END LOOP;
END $migration$;
REVOKE ALL ON FUNCTION public.admin_daily_stats_v3(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_daily_stats_v3(date) TO service_role;
REVOKE ALL ON FUNCTION public.admin_daily_extra_stats(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_daily_extra_stats(date) TO service_role;
COMMENT ON FUNCTION public.admin_daily_stats_v3(date) IS 'Only issues are restricted to the latest numeric app release across iOS/Android; builds are combined. Other metrics and history are unchanged.';
COMMENT ON FUNCTION public.admin_daily_extra_stats(date) IS 'Affected issue devices follow the same latest app release as issue counts. Other metrics and history are unchanged.';