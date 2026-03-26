
-- Enable extensions for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Allow service role (via edge function) to delete stale games and players
CREATE POLICY "Service role can delete games"
ON public.games
FOR DELETE
TO service_role
USING (true);

CREATE POLICY "Service role can delete game_players"
ON public.game_players
FOR DELETE
TO service_role
USING (true);
