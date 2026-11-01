ALTER FUNCTION public.admin_daily_stats_v5(date) SET statement_timeout = '90s';
ALTER FUNCTION public.admin_daily_stats_v4(date) SET statement_timeout = '90s';
CREATE INDEX IF NOT EXISTS analytics_events_app_device_created_idx ON public.analytics_events (device_id, created_at) WHERE platform IN ('ios','android') AND device_id IS NOT NULL;