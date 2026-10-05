-- Public dice info for the players of one game: tier, matches with a Yatzy, and whether
-- temporary invite gold is active (no end date, no friend data).
CREATE OR REPLACE FUNCTION public.get_dice_profiles(p_game_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'player_index', gp.player_index,
      'is_bot', gp.is_bot,
      'tier', CASE WHEN gp.is_bot THEN 'white' ELSE coalesce(d.tier, 'white') END,
      'yatzy_matches', CASE WHEN gp.is_bot THEN 0 ELSE coalesce(d.yatzy_matches, 0) END,
      'invite_gold', NOT gp.is_bot AND EXISTS (
        SELECT 1 FROM referral_rewards r WHERE r.session_id = gp.session_id AND r.gold_until > now())
    ) ORDER BY gp.player_index), '[]'::jsonb)
  FROM game_players gp
  LEFT JOIN dice_progress d ON d.session_id = gp.session_id
  WHERE gp.game_id = p_game_id;
$$;
GRANT EXECUTE ON FUNCTION public.get_dice_profiles(uuid) TO anon, authenticated;