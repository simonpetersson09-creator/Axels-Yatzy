DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.admin_daily_stats_v3(date)'::regprocedure) INTO definition;
 IF position('select public.admin_issue_release(app_version) release from analytics_sessions' in definition) = 0 THEN
  RAISE EXCEPTION 'Unexpected admin release lookup';
 END IF;
 definition := replace(definition,
 'select public.admin_issue_release(app_version) release from analytics_sessions where platform in (''ios'',''android'')
  union select public.admin_issue_release(app_version) release from analytics_events where platform in (''ios'',''android'')',
 'select distinct public.admin_issue_release(app_version) release from (
   select distinct app_version from analytics_sessions where platform in (''ios'',''android'')
   union select distinct app_version from analytics_events where platform in (''ios'',''android'')
  ) raw_versions');
 EXECUTE definition;
END;
$migration$;