CREATE INDEX IF NOT EXISTS idx_notification_log_cooldown
ON public.notification_log (game_id, recipient_session_id, kind, sent_at DESC);