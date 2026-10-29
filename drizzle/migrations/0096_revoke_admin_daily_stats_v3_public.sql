REVOKE ALL ON FUNCTION public.admin_daily_stats_v3(date) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_daily_stats_v3(date) TO service_role;