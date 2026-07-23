
-- 1) game_invites: remove the broad public SELECT policy and gate access through an RPC
DROP POLICY IF EXISTS "Invites are readable" ON public.game_invites;

CREATE OR REPLACE FUNCTION public.list_invites_for_session(p_session_id text)
RETURNS SETOF public.game_invites
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.game_invites
  WHERE p_session_id IS NOT NULL
    AND p_session_id <> ''
    AND (from_session_id = p_session_id OR to_session_id = p_session_id);
$$;

REVOKE ALL ON FUNCTION public.list_invites_for_session(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_invites_for_session(text) TO anon, authenticated;

-- 2) realtime.messages: scope public policy to the quick-chat topics the app actually uses
DROP POLICY IF EXISTS "Allow public realtime subscriptions" ON realtime.messages;

CREATE POLICY "Quick chat broadcast read"
  ON realtime.messages
  FOR SELECT
  TO anon, authenticated
  USING (realtime.topic() LIKE 'quick-chat-%');

CREATE POLICY "Quick chat broadcast write"
  ON realtime.messages
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (realtime.topic() LIKE 'quick-chat-%');
