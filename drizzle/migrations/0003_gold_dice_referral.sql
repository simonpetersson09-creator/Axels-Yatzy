CREATE TABLE public.referral_rewards (
  session_id text PRIMARY KEY,
  gold_until timestamptz NOT NULL,
  friends_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.referral_rewards TO service_role;
ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "no direct access to referral rewards" ON public.referral_rewards FOR SELECT USING (false);

CREATE TABLE public.referral_credits (
  invitee_session_id text PRIMARY KEY,
  inviter_session_id text NOT NULL,
  game_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.referral_credits TO service_role;
ALTER TABLE public.referral_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "no direct access to referral credits" ON public.referral_credits FOR SELECT USING (false);

-- A brand-new install joining a friend game hosted by someone else credits the host:
-- +10 days of gold dice per new friend (days stack).
CREATE OR REPLACE FUNCTION public.trg_referral_credit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_quick boolean;
  v_host text;
  v_joiner_created timestamptz;
  v_joiner_device text;
  v_host_device text;
BEGIN
  IF NEW.is_bot OR NEW.player_index = 0 THEN RETURN NEW; END IF;
  SELECT is_quick_match INTO v_quick FROM games WHERE id = NEW.game_id;
  IF v_quick IS DISTINCT FROM false THEN RETURN NEW; END IF;

  SELECT session_id INTO v_host FROM game_players
   WHERE game_id = NEW.game_id AND player_index = 0 AND NOT is_bot LIMIT 1;
  IF v_host IS NULL OR v_host = NEW.session_id THEN RETURN NEW; END IF;

  SELECT created_at, device_id INTO v_joiner_created, v_joiner_device
    FROM session_owners WHERE session_id = NEW.session_id;
  IF v_joiner_created IS NULL OR v_joiner_created < now() - interval '48 hours' THEN RETURN NEW; END IF;

  SELECT device_id INTO v_host_device FROM session_owners WHERE session_id = v_host;
  IF v_host_device IS NULL OR v_host_device = v_joiner_device THEN RETURN NEW; END IF;

  -- Joiner must never have played an online/friend game before.
  IF EXISTS (SELECT 1 FROM game_players WHERE session_id = NEW.session_id AND id <> NEW.id) THEN
    RETURN NEW;
  END IF;

  INSERT INTO referral_credits (invitee_session_id, inviter_session_id, game_id)
  VALUES (NEW.session_id, v_host, NEW.game_id)
  ON CONFLICT (invitee_session_id) DO NOTHING;
  IF NOT FOUND THEN RETURN NEW; END IF;

  INSERT INTO referral_rewards (session_id, gold_until, friends_count)
  VALUES (v_host, now() + interval '10 days', 1)
  ON CONFLICT (session_id) DO UPDATE
    SET gold_until = greatest(referral_rewards.gold_until, now()) + interval '10 days',
        friends_count = referral_rewards.friends_count + 1,
        updated_at = now();
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW; -- never block joining a game
END;
$$;

CREATE TRIGGER referral_credit_on_join
AFTER INSERT ON public.game_players
FOR EACH ROW EXECUTE FUNCTION public.trg_referral_credit();

CREATE OR REPLACE FUNCTION public.get_gold_dice(p_session_id text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT jsonb_build_object('gold_until', gold_until, 'friends', friends_count)
       FROM referral_rewards WHERE session_id = p_session_id),
    jsonb_build_object('gold_until', null, 'friends', 0));
$$;
GRANT EXECUTE ON FUNCTION public.get_gold_dice(text) TO anon, authenticated;