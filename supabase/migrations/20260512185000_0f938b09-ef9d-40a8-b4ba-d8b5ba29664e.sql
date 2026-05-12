-- Notification preferences (per device)
CREATE TABLE public.notification_preferences (
  device_id text PRIMARY KEY,
  turn_notifications boolean NOT NULL DEFAULT true,
  reminder_notifications boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read notification preferences"
  ON public.notification_preferences FOR SELECT
  TO anon, authenticated USING (true);

CREATE POLICY "Anyone can upsert notification preferences"
  ON public.notification_preferences FOR INSERT
  TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Anyone can update notification preferences"
  ON public.notification_preferences FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

-- Push tokens (per device)
CREATE TABLE public.push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL,
  session_id text,
  platform text NOT NULL,
  token text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (device_id, token)
);

CREATE INDEX idx_push_tokens_session ON public.push_tokens (session_id) WHERE enabled = true;
CREATE INDEX idx_push_tokens_device ON public.push_tokens (device_id) WHERE enabled = true;

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read push tokens"
  ON public.push_tokens FOR SELECT
  TO anon, authenticated USING (true);

CREATE POLICY "Anyone can insert push tokens"
  ON public.push_tokens FOR INSERT
  TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Anyone can update push tokens"
  ON public.push_tokens FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

-- Notification log (anti-spam + analytics)
CREATE TABLE public.notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL,
  recipient_session_id text NOT NULL,
  recipient_device_id text,
  kind text NOT NULL CHECK (kind IN ('turn','reminder')),
  round integer,
  player_index integer,
  sent_at timestamptz NOT NULL DEFAULT now(),
  opened_at timestamptz,
  delivered boolean NOT NULL DEFAULT false,
  metadata jsonb
);

-- Idempotency: one turn notification per (game, recipient, round, player_index)
CREATE UNIQUE INDEX uniq_turn_notif
  ON public.notification_log (game_id, recipient_session_id, round, player_index)
  WHERE kind = 'turn';

CREATE INDEX idx_notif_log_recipient ON public.notification_log (recipient_session_id, sent_at DESC);
CREATE INDEX idx_notif_log_game ON public.notification_log (game_id, kind, sent_at DESC);

ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read own notification log"
  ON public.notification_log FOR SELECT
  TO anon, authenticated USING (true);

CREATE POLICY "Anyone can update opened_at"
  ON public.notification_log FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Service role can insert notifications"
  ON public.notification_log FOR INSERT
  TO service_role WITH CHECK (true);

CREATE POLICY "Service role can delete notifications"
  ON public.notification_log FOR DELETE
  TO service_role USING (true);