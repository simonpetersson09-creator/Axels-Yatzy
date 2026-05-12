CREATE TABLE public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  session_id text,
  local_user_id text,
  game_id text,
  game_mode text,
  metadata jsonb,
  platform text,
  app_version text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_analytics_events_event_name ON public.analytics_events(event_name);
CREATE INDEX idx_analytics_events_created_at ON public.analytics_events(created_at DESC);
CREATE INDEX idx_analytics_events_session_id ON public.analytics_events(session_id);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Anyone can insert analytics events (anonymous tracking)
CREATE POLICY "Anyone can insert analytics events"
  ON public.analytics_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only service_role can read (handled implicitly by no SELECT policy + service_role bypass)
CREATE POLICY "Service role can read analytics"
  ON public.analytics_events
  FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Service role can delete analytics"
  ON public.analytics_events
  FOR DELETE
  TO service_role
  USING (true);