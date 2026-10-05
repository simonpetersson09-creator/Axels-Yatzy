-- Permanent dice tiers: bronze after 10 finished matches with a Yatzy, silver 50, gold 200.
-- Max one Yatzy per finished match; forfeited matches never count. Tier never goes down.
CREATE TABLE public.dice_progress (
  session_id text PRIMARY KEY,
  yatzy_matches integer NOT NULL DEFAULT 0,
  tier text NOT NULL DEFAULT 'white',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.dice_progress TO service_role;
ALTER TABLE public.dice_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "no direct access to dice progress" ON public.dice_progress FOR SELECT USING (false);

CREATE TABLE public.yatzy_match_log (
  session_id text NOT NULL,
  match_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, match_key)
);
GRANT ALL ON public.yatzy_match_log TO service_role;
ALTER TABLE public.yatzy_match_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "no direct access to yatzy match log" ON public.yatzy_match_log FOR SELECT USING (false);

CREATE OR REPLACE FUNCTION public.internal_tier_for(p_n integer)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE WHEN p_n >= 200 THEN 'gold' WHEN p_n >= 50 THEN 'silver' WHEN p_n >= 10 THEN 'bronze' ELSE 'white' END
$$;

CREATE OR REPLACE FUNCTION public.internal_tier_rank(p_tier text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE p_tier WHEN 'gold' THEN 3 WHEN 'silver' THEN 2 WHEN 'bronze' THEN 1 ELSE 0 END
$$;

CREATE OR REPLACE FUNCTION public.internal_add_yatzy_match(p_session text, p_key text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_n integer;
BEGIN
  IF p_session IS NULL OR p_key IS NULL THEN RETURN false; END IF;
  INSERT INTO yatzy_match_log (session_id, match_key) VALUES (p_session, p_key) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO dice_progress (session_id, yatzy_matches, tier) VALUES (p_session, 1, 'white')
  ON CONFLICT (session_id) DO UPDATE SET yatzy_matches = dice_progress.yatzy_matches + 1, updated_at = now()
  RETURNING yatzy_matches INTO v_n;
  UPDATE dice_progress SET tier = internal_tier_for(v_n)
   WHERE session_id = p_session AND internal_tier_rank(internal_tier_for(v_n)) > internal_tier_rank(tier);
  RETURN true;
END $$;

-- Online matches: the server counts them itself when a match finishes.
CREATE OR REPLACE FUNCTION public.trg_yatzy_on_finish()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record;
BEGIN
  IF NEW.status <> 'finished' OR OLD.status = 'finished' OR NEW.forfeited_by IS NOT NULL THEN RETURN NEW; END IF;
  FOR r IN SELECT session_id FROM game_players
            WHERE game_id = NEW.id AND NOT is_bot AND (scores->>'yatzy') = '50' LOOP
    PERFORM internal_add_yatzy_match(r.session_id, 'mp:' || NEW.id::text);
  END LOOP;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $$;

CREATE TRIGGER trg_yatzy_on_finish AFTER UPDATE OF status ON public.games
FOR EACH ROW EXECUTE FUNCTION public.trg_yatzy_on_finish();

-- Matches against the computer run on the phone; the app reports them.
CREATE OR REPLACE FUNCTION public.record_local_yatzy_match(p_session_id text, p_device_id text, p_match_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_owner text;
BEGIN
  IF p_match_key IS NULL OR p_match_key NOT LIKE 'sp:%' OR length(p_match_key) > 80 THEN
    RETURN jsonb_build_object('ok', false);
  END IF;
  SELECT device_id INTO v_owner FROM session_owners WHERE session_id = p_session_id;
  IF v_owner IS NULL OR v_owner <> p_device_id THEN RETURN jsonb_build_object('ok', false); END IF;
  -- A full match takes minutes; reject faster reports.
  IF NOT check_rate_limit('yatzy_match:' || p_session_id, 90) THEN RETURN jsonb_build_object('ok', false); END IF;
  RETURN jsonb_build_object('ok', internal_add_yatzy_match(p_session_id, p_match_key));
END $$;

CREATE OR REPLACE FUNCTION public.get_gold_dice(p_session_id text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object(
    'gold_until', (SELECT CASE WHEN gold_until > now() THEN gold_until END FROM referral_rewards WHERE session_id = p_session_id),
    'friends', coalesce((SELECT friends_count FROM referral_rewards WHERE session_id = p_session_id), 0),
    'progress', coalesce((SELECT friends_count % 3 FROM referral_rewards WHERE session_id = p_session_id), 0),
    'tier', coalesce((SELECT tier FROM dice_progress WHERE session_id = p_session_id), 'white'),
    'yatzy_matches', coalesce((SELECT yatzy_matches FROM dice_progress WHERE session_id = p_session_id), 0));
$$;

-- Effective dice colour per player: best of permanent tier and temporary gold.
CREATE OR REPLACE FUNCTION public.get_dice_skins(p_session_ids text[])
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(jsonb_object_agg(s.id, s.skin), '{}'::jsonb) FROM (
    SELECT ids.id,
      CASE WHEN EXISTS (SELECT 1 FROM referral_rewards r WHERE r.session_id = ids.id AND r.gold_until > now())
           THEN 'gold' ELSE coalesce((SELECT tier FROM dice_progress d WHERE d.session_id = ids.id), 'white') END AS skin
    FROM unnest(p_session_ids[1:8]) AS ids(id)
  ) s WHERE s.skin <> 'white';
$$;

REVOKE ALL ON FUNCTION public.internal_add_yatzy_match(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_yatzy_on_finish() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_local_yatzy_match(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_dice_skins(text[]) TO anon, authenticated;