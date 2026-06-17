DROP POLICY IF EXISTS "Active invites are readable" ON public.game_invites;
CREATE POLICY "Invites are readable" ON public.game_invites FOR SELECT USING (true);