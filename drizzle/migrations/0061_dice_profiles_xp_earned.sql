CREATE OR REPLACE FUNCTION public.get_dice_profiles(p_game_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'player_index', gp.player_index,
      'is_bot', gp.is_bot,
      'tier', CASE WHEN gp.is_bot THEN 'white' ELSE coalesce(d.tier, 'white') END,
      'yatzy_matches', CASE WHEN gp.is_bot THEN 0 ELSE coalesce(d.yatzy_matches, 0) END,
      'invite_gold', NOT gp.is_bot AND EXISTS (
        SELECT 1 FROM referral_rewards r WHERE r.session_id = gp.session_id AND r.gold_until > now()),
      'prefer_white', NOT gp.is_bot AND coalesce(p.prefer_white, false),
      'design', CASE WHEN gp.is_bot THEN NULL ELSE x.selected_design END,
      'xp_earned', CASE WHEN gp.is_bot THEN 0 ELSE coalesce(x.xp, 0) + coalesce((SELECT sum(pd.price_paid) FROM player_designs pd WHERE pd.session_id = gp.session_id), 0) END
    ) ORDER BY gp.player_index), '[]'::jsonb)
  FROM game_players gp
  LEFT JOIN dice_progress d ON d.session_id = gp.session_id
  LEFT JOIN dice_preferences p ON p.session_id = gp.session_id
  LEFT JOIN player_xp x ON x.session_id = gp.session_id
  WHERE gp.game_id = p_game_id;
$$;