-- Replace the unscoped SELECT policy on game_invites. Sessions are anonymous
-- (no auth.uid()), so RLS can't bind to a user — but we can drastically reduce
-- the enumeration surface by only exposing rows that are still live.
DROP POLICY IF EXISTS "Anyone can read invites" ON public.game_invites;

CREATE POLICY "Active invites are readable"
ON public.game_invites
FOR SELECT
USING (
  status = 'pending'
  AND expires_at > now()
);