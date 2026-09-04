-- Lock down direct client inserts into analytics tables
DROP POLICY IF EXISTS "Anyone can insert analytics events" ON public.analytics_events;
DROP POLICY IF EXISTS "Anyone can insert analytics sessions" ON public.analytics_sessions;

REVOKE INSERT ON public.analytics_events FROM anon, authenticated;
REVOKE INSERT ON public.analytics_sessions FROM anon, authenticated;
GRANT ALL ON public.analytics_events TO service_role;
GRANT ALL ON public.analytics_sessions TO service_role;

-- Validated write path: device must be a claimed device (session_owners)
CREATE OR REPLACE FUNCTION public.log_analytics_session(
  p_id text,
  p_device_id text,
  p_platform text,
  p_app_version text,
  p_started_at timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_id IS NULL OR p_device_id IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.session_owners WHERE device_id = p_device_id) THEN
    RETURN;
  END IF;
  INSERT INTO public.analytics_sessions (id, device_id, platform, app_version, started_at, last_seen_at)
  VALUES (
    left(p_id, 64),
    p_device_id,
    left(coalesce(p_platform, 'unknown'), 32),
    left(coalesce(p_app_version, ''), 32),
    coalesce(p_started_at, now()),
    coalesce(p_started_at, now())
  )
  ON CONFLICT (id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_analytics_events(
  p_device_id text,
  p_events jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count int;
BEGIN
  IF p_device_id IS NULL OR p_events IS NULL OR jsonb_typeof(p_events) <> 'array' THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.session_owners WHERE device_id = p_device_id) THEN
    RETURN;
  END IF;
  v_count := jsonb_array_length(p_events);
  IF v_count = 0 OR v_count > 50 THEN
    RETURN;
  END IF;

  INSERT INTO public.analytics_events (
    event_name, session_id, device_id, local_user_id, auth_user_id,
    game_id, game_mode, metadata, platform, app_version
  )
  SELECT
    left(coalesce(e->>'event_name', 'unknown'), 64),
    left(e->>'session_id', 64),
    p_device_id,
    p_device_id,
    -- never trust a client-supplied user id
    (SELECT auth.uid()::text),
    left(e->>'game_id', 64),
    left(e->>'game_mode', 32),
    CASE WHEN jsonb_typeof(e->'metadata') = 'object' THEN e->'metadata' ELSE NULL END,
    left(e->>'platform', 32),
    left(e->>'app_version', 32)
  FROM jsonb_array_elements(p_events) AS e;
END;
$$;

REVOKE ALL ON FUNCTION public.log_analytics_session(text, text, text, text, timestamptz) FROM public;
REVOKE ALL ON FUNCTION public.log_analytics_events(text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.log_analytics_session(text, text, text, text, timestamptz) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.log_analytics_events(text, jsonb) TO anon, authenticated, service_role;