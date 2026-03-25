
-- Drop permissive UPDATE policies that allow any client to mutate game state
DROP POLICY IF EXISTS "Anyone can update games" ON public.games;
DROP POLICY IF EXISTS "Anyone can update game players" ON public.game_players;

-- Drop permissive INSERT policies (all inserts go through RPC/Edge Functions with service role)
DROP POLICY IF EXISTS "Anyone can create games" ON public.games;
DROP POLICY IF EXISTS "Anyone can join games" ON public.game_players;

-- Keep SELECT policies so realtime and reads still work
-- All writes now go through Edge Functions / RPCs using service_role key
