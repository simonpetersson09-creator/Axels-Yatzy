CREATE OR REPLACE FUNCTION public.internal_tier_for(p_n integer)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE WHEN p_n >= 1000 THEN 'platinum' WHEN p_n >= 200 THEN 'gold' WHEN p_n >= 50 THEN 'silver' WHEN p_n >= 10 THEN 'bronze' ELSE 'white' END
$$;
CREATE OR REPLACE FUNCTION public.internal_tier_rank(p_tier text)
 RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE p_tier WHEN 'platinum' THEN 4 WHEN 'gold' THEN 3 WHEN 'silver' THEN 2 WHEN 'bronze' THEN 1 ELSE 0 END
$$;
-- Temporary invite gold never hides a higher permanent tier.
CREATE OR REPLACE FUNCTION public.get_dice_skins(p_session_ids text[])
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(jsonb_object_agg(s.id, s.skin), '{}'::jsonb) FROM (
    SELECT ids.id,
      CASE WHEN coalesce((SELECT tier FROM dice_progress d WHERE d.session_id = ids.id), 'white') = 'platinum' THEN 'platinum'
           WHEN EXISTS (SELECT 1 FROM referral_rewards r WHERE r.session_id = ids.id AND r.gold_until > now()) THEN 'gold'
           ELSE coalesce((SELECT tier FROM dice_progress d WHERE d.session_id = ids.id), 'white') END AS skin
    FROM unnest(p_session_ids[1:8]) AS ids(id)
  ) s WHERE s.skin <> 'white';
$$;