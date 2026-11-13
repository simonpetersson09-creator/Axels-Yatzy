CREATE OR REPLACE FUNCTION public.admin_is_app_activity_event(_event text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$ SELECT coalesce(_event NOT IN ('play_reminder_sent','reminder_notification_sent','turn_notification_sent','broadcast_notification_sent'),false) $$;
REVOKE ALL ON FUNCTION public.admin_is_app_activity_event(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_is_app_activity_event(text) TO service_role;
COMMENT ON FUNCTION public.admin_is_app_activity_event(text) IS 'Server notification sends are delivery diagnostics, never evidence of a recipient app visit. Notification opens and actual app sessions remain activity.';
DO $patch$
DECLARE name text; source text; patched text;
BEGIN
 FOREACH name IN ARRAY ARRAY['admin_daily_stats_v3','admin_daily_stats_v4','admin_daily_stats_v5'] LOOP
  source := pg_get_functiondef(to_regprocedure('public.' || name || '(date)'));
  patched := replace(source,'from analytics_events where platform in', 'from analytics_events where public.admin_is_app_activity_event(event_name) and platform in');
  patched := replace(patched,'FROM analytics_events WHERE platform IN', 'FROM analytics_events WHERE public.admin_is_app_activity_event(event_name) AND platform IN');
  IF patched = source THEN RAISE EXCEPTION 'No analytics activity branch found in %',name; END IF;
  EXECUTE patched;
 END LOOP;
END;
$patch$;