
-- 1. push_tokens: revoke direct anon/authenticated access entirely.
DROP POLICY IF EXISTS "Anyone can insert push tokens" ON public.push_tokens;
DROP POLICY IF EXISTS "Anyone can read push tokens" ON public.push_tokens;
DROP POLICY IF EXISTS "Anyone can update push tokens" ON public.push_tokens;
REVOKE ALL ON public.push_tokens FROM anon, authenticated;
GRANT ALL ON public.push_tokens TO service_role;
CREATE POLICY "Service role manages push tokens"
  ON public.push_tokens FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 2. notification_preferences: revoke direct anon/authenticated access.
DROP POLICY IF EXISTS "Anyone can read notification preferences" ON public.notification_preferences;
DROP POLICY IF EXISTS "Anyone can update notification preferences" ON public.notification_preferences;
DROP POLICY IF EXISTS "Anyone can upsert notification preferences" ON public.notification_preferences;
REVOKE ALL ON public.notification_preferences FROM anon, authenticated;
GRANT ALL ON public.notification_preferences TO service_role;
CREATE POLICY "Service role manages notification preferences"
  ON public.notification_preferences FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 3. notification_log: revoke direct anon/authenticated access.
DROP POLICY IF EXISTS "Anyone can read own notification log" ON public.notification_log;
DROP POLICY IF EXISTS "Anyone can update opened_at" ON public.notification_log;
REVOKE ALL ON public.notification_log FROM anon, authenticated;
GRANT ALL ON public.notification_log TO service_role;
-- Keep existing service-role insert/delete policies. Add ALL for clarity.
CREATE POLICY "Service role manages notification log"
  ON public.notification_log FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 4. Realtime: explicitly allow subscriptions. Game and game_player rows are
-- already public via their own SELECT policies, so realtime mirrors that.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'realtime' AND tablename = 'messages'
  ) THEN
    EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Allow public realtime subscriptions" ON realtime.messages';
    EXECUTE $p$CREATE POLICY "Allow public realtime subscriptions"
      ON realtime.messages FOR SELECT TO anon, authenticated USING (true)$p$;
  END IF;
END $$;
