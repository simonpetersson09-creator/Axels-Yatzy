CREATE OR REPLACE FUNCTION public.admin_is_significant_issue(_metadata jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$
 SELECT CASE
 WHEN coalesce(_metadata->>'kind','') IN ('turn_change_blocked','dice_result_fallback','dice_msg_ignored') THEN
   coalesce(_metadata->>'via' = 'late_after_timeout', false)
   OR CASE WHEN jsonb_typeof(_metadata->'waitedMs') = 'number' THEN (_metadata->>'waitedMs')::numeric > 3000 ELSE false END
   OR CASE WHEN jsonb_typeof(_metadata->'ms') = 'number' THEN (_metadata->>'ms')::numeric > 3000 ELSE false END
 ELSE true END;
$function$;
REVOKE ALL ON FUNCTION public.admin_is_significant_issue(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_is_significant_issue(jsonb) TO service_role;
COMMENT ON FUNCTION public.admin_is_significant_issue(jsonb) IS 'Routine guards and fallback deliveries are diagnostic only unless actual elapsed ms/waitedMs exceeds 3000 or a roll arrived after its timeout. snapAgeMs is not elapsed wait. Other errors remain visible; diagnostics are retained.';
DO $migration$
DECLARE target text; definition text; updated text;
BEGIN
 FOREACH target IN ARRAY ARRAY['public.admin_daily_stats_v3(date)', 'public.admin_daily_extra_stats(date)'] LOOP
  definition := pg_get_functiondef(target::regprocedure);
  updated := regexp_replace(definition, 'event_name\s*=\s*''mp_issue''', 'event_name=''mp_issue'' AND public.admin_is_significant_issue(metadata)', 'gi');
  IF updated = definition THEN RAISE EXCEPTION 'Expected issue counter missing in %', target; END IF;
  EXECUTE updated;
 END LOOP;
END $migration$;
REVOKE ALL ON FUNCTION public.admin_daily_stats_v3(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_daily_stats_v3(date) TO service_role;
REVOKE ALL ON FUNCTION public.admin_daily_extra_stats(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_daily_extra_stats(date) TO service_role;