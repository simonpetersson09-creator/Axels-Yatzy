
DROP POLICY IF EXISTS "Anyone can update analytics sessions" ON public.analytics_sessions;

CREATE OR REPLACE FUNCTION public.update_analytics_session(
  p_id text,
  p_device_id text,
  p_last_seen_at timestamptz DEFAULT NULL,
  p_ended_at timestamptz DEFAULT NULL,
  p_duration_seconds integer DEFAULT NULL
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.analytics_sessions
  SET last_seen_at = COALESCE(p_last_seen_at, last_seen_at),
      ended_at = COALESCE(p_ended_at, ended_at),
      duration_seconds = COALESCE(p_duration_seconds, duration_seconds)
  WHERE id = p_id
    AND device_id IS NOT NULL
    AND p_device_id IS NOT NULL
    AND device_id = p_device_id;
$$;

GRANT EXECUTE ON FUNCTION public.update_analytics_session(text, text, timestamptz, timestamptz, integer) TO anon, authenticated, service_role;
