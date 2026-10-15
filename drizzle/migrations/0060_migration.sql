CREATE TABLE public.dice_designs (
  id text PRIMARY KEY,
  price integer NOT NULL CHECK (price > 0),
  sort_order integer NOT NULL DEFAULT 0
);
GRANT ALL ON public.dice_designs TO service_role;
ALTER TABLE public.dice_designs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.player_xp (
  session_id text PRIMARY KEY,
  xp integer NOT NULL DEFAULT 0 CHECK (xp >= 0),
  earned_today integer NOT NULL DEFAULT 0,
  earned_day date NOT NULL DEFAULT current_date,
  last_earned_at timestamptz,
  selected_design text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.player_xp TO service_role;
ALTER TABLE public.player_xp ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.player_designs (
  session_id text NOT NULL,
  design_id text NOT NULL REFERENCES public.dice_designs(id),
  price_paid integer NOT NULL,
  bought_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, design_id)
);
GRANT ALL ON public.player_designs TO service_role;
ALTER TABLE public.player_designs ENABLE ROW LEVEL SECURITY;

INSERT INTO public.dice_designs (id, price, sort_order) VALUES
 ('ruby',5,1),('ocean',5,2),('mint',5,3),('sun',5,4),('rose',6,5),('lilac',6,6),('coal',8,7),('forest',8,8),('sky',8,9),('coral',10,10),('sand',10,11),('night',10,12),
 ('ice',20,20),('lava',20,21),('candy',25,22),('jungle',25,23),('ink',25,24),('peach',30,25),('arctic',30,26),('cherry',35,27),('royal',35,28),('neon',40,29),
 ('pearl',75,40),('emerald',75,41),('sapphire',80,42),('obsidian',85,43),('aurora',90,44),('rosegold',90,45),('galaxy',100,46),('diamond',100,47);

CREATE OR REPLACE FUNCTION public.get_dice_shop(p_session_id text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object(
    'xp', coalesce((SELECT xp FROM player_xp WHERE session_id = p_session_id), 0),
    'earned_today', coalesce((SELECT CASE WHEN earned_day = current_date THEN earned_today ELSE 0 END FROM player_xp WHERE session_id = p_session_id), 0),
    'daily_cap', 10,
    'selected', (SELECT selected_design FROM player_xp WHERE session_id = p_session_id),
    'owned', coalesce((SELECT jsonb_agg(design_id) FROM player_designs WHERE session_id = p_session_id), '[]'::jsonb),
    'designs', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'price', price) ORDER BY sort_order) FROM dice_designs), '[]'::jsonb));
$$;

CREATE OR REPLACE FUNCTION public.award_ad_xp(p_session_id text, p_device_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r player_xp%ROWTYPE;
BEGIN
  IF NOT public.claim_session(p_session_id, p_device_id) THEN RETURN jsonb_build_object('ok', false, 'reason', 'auth'); END IF;
  INSERT INTO player_xp (session_id) VALUES (p_session_id) ON CONFLICT DO NOTHING;
  SELECT * INTO r FROM player_xp WHERE session_id = p_session_id FOR UPDATE;
  IF r.earned_day <> current_date THEN r.earned_today := 0; END IF;
  IF r.earned_today >= 10 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cap', 'xp', r.xp);
  END IF;
  IF r.last_earned_at IS NOT NULL AND r.last_earned_at > now() - interval '15 seconds' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cooldown', 'xp', r.xp);
  END IF;
  UPDATE player_xp SET xp = xp + 1, earned_today = r.earned_today + 1, earned_day = current_date,
    last_earned_at = now(), updated_at = now()
  WHERE session_id = p_session_id RETURNING * INTO r;
  RETURN jsonb_build_object('ok', true, 'xp', r.xp, 'earned_today', r.earned_today);
END $$;

CREATE OR REPLACE FUNCTION public.buy_dice_design(p_session_id text, p_device_id text, p_design_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_price int; v_xp int;
BEGIN
  IF NOT public.claim_session(p_session_id, p_device_id) THEN RETURN jsonb_build_object('ok', false, 'reason', 'auth'); END IF;
  SELECT price INTO v_price FROM dice_designs WHERE id = p_design_id;
  IF v_price IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unknown'); END IF;
  INSERT INTO player_xp (session_id) VALUES (p_session_id) ON CONFLICT DO NOTHING;
  SELECT xp INTO v_xp FROM player_xp WHERE session_id = p_session_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM player_designs WHERE session_id = p_session_id AND design_id = p_design_id) THEN
    RETURN jsonb_build_object('ok', true, 'xp', v_xp, 'already', true);
  END IF;
  IF v_xp < v_price THEN RETURN jsonb_build_object('ok', false, 'reason', 'xp', 'xp', v_xp); END IF;
  INSERT INTO player_designs (session_id, design_id, price_paid) VALUES (p_session_id, p_design_id, v_price);
  UPDATE player_xp SET xp = xp - v_price, selected_design = p_design_id, updated_at = now()
  WHERE session_id = p_session_id RETURNING xp INTO v_xp;
  INSERT INTO dice_preferences (session_id, prefer_white, updated_at) VALUES (p_session_id, false, now())
  ON CONFLICT (session_id) DO UPDATE SET prefer_white = false, updated_at = now();
  RETURN jsonb_build_object('ok', true, 'xp', v_xp);
END $$;

CREATE OR REPLACE FUNCTION public.select_dice_design(p_session_id text, p_device_id text, p_design_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.claim_session(p_session_id, p_device_id) THEN RETURN false; END IF;
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
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'player_index', gp.player_index,
      'is_bot', gp.is_bot,
      'tier', CASE WHEN gp.is_bot THEN 'white' ELSE coalesce(d.tier, 'white') END,
      'yatzy_matches', CASE WHEN gp.is_bot THEN 0 ELSE coalesce(d.yatzy_matches, 0) END,
      'invite_gold', NOT gp.is_bot AND EXISTS (
        SELECT 1 FROM referral_rewards r WHERE r.session_id = gp.session_id AND r.gold_until > now()),
      'prefer_white', NOT gp.is_bot AND coalesce(p.prefer_white, false),
      'design', CASE WHEN gp.is_bot THEN NULL ELSE x.selected_design END
    ) ORDER BY gp.player_index), '[]'::jsonb)
  FROM game_players gp
  LEFT JOIN dice_progress d ON d.session_id = gp.session_id
  LEFT JOIN dice_preferences p ON p.session_id = gp.session_id
  LEFT JOIN player_xp x ON x.session_id = gp.session_id
  WHERE gp.game_id = p_game_id;
$function$;

-- Choosing white dice clears the shop design.
CREATE OR REPLACE FUNCTION public.set_dice_prefer_white(p_session_id text, p_device_id text, p_prefer_white boolean)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.claim_session(p_session_id, p_device_id) THEN RETURN false; END IF;
  INSERT INTO dice_preferences (session_id, prefer_white, updated_at)
  VALUES (p_session_id, coalesce(p_prefer_white, false), now())
  ON CONFLICT (session_id) DO UPDATE SET prefer_white = EXCLUDED.prefer_white, updated_at = now();
  IF p_prefer_white THEN
    UPDATE player_xp SET selected_design = NULL, updated_at = now() WHERE session_id = p_session_id;
  END IF;
  RETURN true;
END $function$;

REVOKE ALL ON FUNCTION public.award_ad_xp(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dice_shop(text), public.award_ad_xp(text, text), public.buy_dice_design(text, text, text), public.select_dice_design(text, text, text) TO anon, authenticated;