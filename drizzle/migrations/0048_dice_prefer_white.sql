CREATE TABLE public.dice_preferences (
  session_id text PRIMARY KEY,
  prefer_white boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.dice_preferences TO service_role;
ALTER TABLE public.dice_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "no direct access to dice preferences" ON public.dice_preferences FOR SELECT USING (false);

CREATE OR REPLACE FUNCTION public.set_dice_prefer_white(p_session_id text, p_device_id text, p_prefer_white boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.claim_session(p_session_id, p_device_id) THEN RETURN false; END IF;
  INSERT INTO dice_preferences (session_id, prefer_white, updated_at)
  VALUES (p_session_id, coalesce(p_prefer_white, false), now())
  ON CONFLICT (session_id) DO UPDATE SET prefer_white = EXCLUDED.prefer_white, updated_at = now();
  RETURN true;
END $$;
GRANT EXECUTE ON FUNCTION public.set_dice_prefer_white(text, text, boolean) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_gold_dice(p_session_id text)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'gold_until', (SELECT CASE WHEN gold_until > now() THEN gold_until END FROM referral_rewards WHERE session_id = p_session_id),
    'friends', coalesce((SELECT friends_count FROM referral_rewards WHERE session_id = p_session_id), 0),
    'progress', coalesce((SELECT friends_count % 3 FROM referral_rewards WHERE session_id = p_session_id), 0),
    'tier', coalesce((SELECT tier FROM dice_progress WHERE session_id = p_session_id), 'white'),
    'yatzy_matches', coalesce((SELECT yatzy_matches FROM dice_progress WHERE session_id = p_session_id), 0),
    'prefer_white', coalesce((SELECT prefer_white FROM dice_preferences WHERE session_id = p_session_id), false));
$function$;

CREATE OR REPLACE FUNCTION public.get_dice_profiles(p_game_id uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'player_index', gp.player_index,
      'is_bot', gp.is_bot,
      'tier', CASE WHEN gp.is_bot THEN 'white' ELSE coalesce(d.tier, 'white') END,
      'yatzy_matches', CASE WHEN gp.is_bot THEN 0 ELSE coalesce(d.yatzy_matches, 0) END,
      'invite_gold', NOT gp.is_bot AND EXISTS (
        SELECT 1 FROM referral_rewards r WHERE r.session_id = gp.session_id AND r.gold_until > now()),
      'prefer_white', NOT gp.is_bot AND coalesce(p.prefer_white, false)
    ) ORDER BY gp.player_index), '[]'::jsonb)
  FROM game_players gp
  LEFT JOIN dice_progress d ON d.session_id = gp.session_id
  LEFT JOIN dice_preferences p ON p.session_id = gp.session_id
  WHERE gp.game_id = p_game_id;
$function$;