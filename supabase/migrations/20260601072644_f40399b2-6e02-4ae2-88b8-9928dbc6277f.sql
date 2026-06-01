
-- Fix skip_inactive_abuse: revoke RPC from public roles; only service_role may call it
REVOKE EXECUTE ON FUNCTION public.skip_inactive_turn(uuid, integer) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.skip_inactive_turn(uuid, integer) TO service_role;

-- Fix friend_results_forge: validate game + participants on INSERT
CREATE OR REPLACE FUNCTION public.validate_friend_match(p_game_id text, p_p1_id text, p_p2_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_game_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.games g
      WHERE g.id::text = p_game_id AND g.status = 'finished'
    )
    AND EXISTS (
      SELECT 1 FROM public.game_players gp
      WHERE gp.game_id::text = p_game_id AND gp.session_id = p_p1_id
    )
    AND EXISTS (
      SELECT 1 FROM public.game_players gp
      WHERE gp.game_id::text = p_game_id AND gp.session_id = p_p2_id
    )
    AND p_p1_id <> p_p2_id;
$$;

DROP POLICY IF EXISTS "Anyone can insert friend match results" ON public.friend_match_results;

CREATE POLICY "Validated friend match inserts"
ON public.friend_match_results
FOR INSERT
TO anon, authenticated
WITH CHECK (
  public.validate_friend_match(game_id, player_1_id, player_2_id)
);
