ALTER TABLE public.dice_designs ADD COLUMN IF NOT EXISTS available_until timestamptz;
ALTER TABLE public.player_xp ADD COLUMN IF NOT EXISTS selected_celebration text;
ALTER TABLE public.player_xp ADD COLUMN IF NOT EXISTS selected_frame text;

INSERT INTO public.dice_designs (id, price, sort_order) VALUES
 ('z_aries',15,60),('z_taurus',15,61),('z_gemini',15,62),('z_cancer',15,63),('z_leo',15,64),('z_virgo',15,65),
 ('z_libra',15,66),('z_scorpio',15,67),('z_sagittarius',15,68),('z_capricorn',15,69),('z_aquarius',15,70),('z_pisces',15,71),
 ('i_cat',15,80),('i_dog',15,81),('i_horse',15,82),('i_football',15,83),('i_music',15,84),('i_gaming',15,85),('i_fishing',15,86),
 ('t_blueyellow',12,90),('t_redwhite',12,91),('t_greenwhite',12,92),('t_blackwhite',12,93),('t_blackyellow',12,94),('t_skyblue',12,95),
 ('cel_fireworks',30,200),('cel_crown',40,201),('cel_dragon',75,202),('cel_hearts',25,203),
 ('frame_gold',20,300),('frame_rainbow',30,301),('frame_flowers',25,302),('frame_fire',40,303),('frame_diamond',75,304)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.dice_designs (id, price, sort_order, available_until) VALUES
 ('h_pumpkin',15,100,'2026-11-01 23:00+00'),('h_ghost',20,101,'2026-11-01 23:00+00'),('h_bat',30,102,'2026-11-01 23:00+00')
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_dice_shop(p_session_id text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object(
    'xp', coalesce((SELECT xp FROM player_xp WHERE session_id = p_session_id), 0),
    'earned_today', coalesce((SELECT CASE WHEN earned_day = current_date THEN earned_today ELSE 0 END FROM player_xp WHERE session_id = p_session_id), 0),
    'daily_cap', 10,
    'selected', (SELECT selected_design FROM player_xp WHERE session_id = p_session_id),
    'selected_celebration', (SELECT selected_celebration FROM player_xp WHERE session_id = p_session_id),
    'selected_frame', (SELECT selected_frame FROM player_xp WHERE session_id = p_session_id),
    'owned', coalesce((SELECT jsonb_agg(design_id) FROM player_designs WHERE session_id = p_session_id), '[]'::jsonb),
    'designs', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'price', price, 'until', available_until) ORDER BY sort_order) FROM dice_designs), '[]'::jsonb));
$$;

CREATE OR REPLACE FUNCTION public.buy_dice_design(p_session_id text, p_device_id text, p_design_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_price int; v_until timestamptz; v_xp int;
BEGIN
  IF NOT public.claim_session(p_session_id, p_device_id) THEN RETURN jsonb_build_object('ok', false, 'reason', 'auth'); END IF;
  SELECT price, available_until INTO v_price, v_until FROM dice_designs WHERE id = p_design_id;
  IF v_price IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unknown'); END IF;
  INSERT INTO player_xp (session_id) VALUES (p_session_id) ON CONFLICT DO NOTHING;
  SELECT xp INTO v_xp FROM player_xp WHERE session_id = p_session_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM player_designs WHERE session_id = p_session_id AND design_id = p_design_id) THEN
    RETURN jsonb_build_object('ok', true, 'xp', v_xp, 'already', true);
  END IF;
  IF v_until IS NOT NULL AND v_until < now() THEN RETURN jsonb_build_object('ok', false, 'reason', 'expired', 'xp', v_xp); END IF;
  IF v_xp < v_price THEN RETURN jsonb_build_object('ok', false, 'reason', 'xp', 'xp', v_xp); END IF;
  INSERT INTO player_designs (session_id, design_id, price_paid) VALUES (p_session_id, p_design_id, v_price);
  IF p_design_id LIKE 'cel\_%' THEN
    UPDATE player_xp SET xp = xp - v_price, selected_celebration = p_design_id, updated_at = now() WHERE session_id = p_session_id RETURNING xp INTO v_xp;
  ELSIF p_design_id LIKE 'frame\_%' THEN
    UPDATE player_xp SET xp = xp - v_price, selected_frame = p_design_id, updated_at = now() WHERE session_id = p_session_id RETURNING xp INTO v_xp;
  ELSE
    UPDATE player_xp SET xp = xp - v_price, selected_design = p_design_id, updated_at = now() WHERE session_id = p_session_id RETURNING xp INTO v_xp;
    INSERT INTO dice_preferences (session_id, prefer_white, updated_at) VALUES (p_session_id, false, now())
    ON CONFLICT (session_id) DO UPDATE SET prefer_white = false, updated_at = now();
  END IF;
  RETURN jsonb_build_object('ok', true, 'xp', v_xp);
END $$;

-- p_slot: 'celebration' or 'frame'; null id = default.
CREATE OR REPLACE FUNCTION public.select_cosmetic(p_session_id text, p_device_id text, p_slot text, p_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.claim_session(p_session_id, p_device_id) THEN RETURN false; END IF;
  IF p_slot NOT IN ('celebration', 'frame') THEN RETURN false; END IF;
  IF p_id IS NOT NULL THEN
    IF (p_slot = 'celebration' AND p_id NOT LIKE 'cel\_%') OR (p_slot = 'frame' AND p_id NOT LIKE 'frame\_%') THEN RETURN false; END IF;
    IF NOT EXISTS (SELECT 1 FROM player_designs WHERE session_id = p_session_id AND design_id = p_id) THEN RETURN false; END IF;
  END IF;
  INSERT INTO player_xp (session_id) VALUES (p_session_id) ON CONFLICT DO NOTHING;
  IF p_slot = 'celebration' THEN
    UPDATE player_xp SET selected_celebration = p_id, updated_at = now() WHERE session_id = p_session_id;
  ELSE
    UPDATE player_xp SET selected_frame = p_id, updated_at = now() WHERE session_id = p_session_id;
  END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.select_dice_design(p_session_id text, p_device_id text, p_design_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.claim_session(p_session_id, p_device_id) THEN RETURN false; END IF;
  IF p_design_id LIKE 'cel\_%' OR p_design_id LIKE 'frame\_%' THEN RETURN false; END IF;
  IF p_design_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM player_designs WHERE session_id = p_session_id AND design_id = p_design_id) THEN
    RETURN false;
  END IF;
  INSERT INTO player_xp (session_id, selected_design) VALUES (p_session_id, p_design_id)
  ON CONFLICT (session_id) DO UPDATE SET selected_design = EXCLUDED.selected_design, updated_at = now();
  IF p_design_id IS NOT NULL THEN
    INSERT INTO dice_preferences (session_id, prefer_white, updated_at) VALUES (p_session_id, false, now())
    ON CONFLICT (session_id) DO UPDATE SET prefer_white = false, updated_at = now();
  END IF;
  RETURN true;
END $$;

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
      'celebration', CASE WHEN gp.is_bot THEN NULL ELSE x.selected_celebration END,
      'frame', CASE WHEN gp.is_bot THEN NULL ELSE x.selected_frame END,
      'xp_earned', CASE WHEN gp.is_bot THEN 0 ELSE coalesce(x.xp, 0) + coalesce((SELECT sum(pd.price_paid) FROM player_designs pd WHERE pd.session_id = gp.session_id), 0) END
    ) ORDER BY gp.player_index), '[]'::jsonb)
  FROM game_players gp
  LEFT JOIN dice_progress d ON d.session_id = gp.session_id
  LEFT JOIN dice_preferences p ON p.session_id = gp.session_id
  LEFT JOIN player_xp x ON x.session_id = gp.session_id
  WHERE gp.game_id = p_game_id;
$$;

REVOKE ALL ON FUNCTION public.select_cosmetic(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.select_cosmetic(text, text, text, text) TO anon, authenticated;