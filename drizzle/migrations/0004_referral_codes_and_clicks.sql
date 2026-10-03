CREATE TABLE public.referral_codes (
  code text PRIMARY KEY,
  session_id text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.referral_codes TO service_role;
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.referral_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_session_id text NOT NULL,
  ip_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX referral_clicks_ip_idx ON public.referral_clicks (ip_hash, created_at DESC);
GRANT ALL ON public.referral_clicks TO service_role;
ALTER TABLE public.referral_clicks ENABLE ROW LEVEL SECURITY;

-- Returns (creating if needed) the caller's personal invite code. Caller must own the session.
CREATE OR REPLACE FUNCTION public.get_referral_code(p_session_id text, p_device_id text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code text; i int;
BEGIN
  IF NOT public.claim_session(p_session_id, p_device_id) THEN RETURN NULL; END IF;
  SELECT code INTO v_code FROM referral_codes WHERE session_id = p_session_id;
  IF v_code IS NOT NULL THEN RETURN v_code; END IF;
  FOR i IN 1..10 LOOP
    v_code := upper(substr(translate(encode(gen_random_bytes(8), 'base64'), '+/=01OIl', ''), 1, 6));
    BEGIN
      INSERT INTO referral_codes (code, session_id) VALUES (v_code, p_session_id);
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      SELECT code INTO v_code FROM referral_codes WHERE session_id = p_session_id;
      IF v_code IS NOT NULL THEN RETURN v_code; END IF;
    END;
  END LOOP;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.get_referral_code(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_referral_code(text, text) TO anon, authenticated, service_role;

-- Server-only: credit inviter for a brand-new install. Same rules as the join trigger.
CREATE OR REPLACE FUNCTION public.internal_grant_referral(p_invitee text, p_inviter text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_created timestamptz; v_dev text; v_inv_dev text;
BEGIN
  IF p_invitee IS NULL OR p_inviter IS NULL OR p_invitee = p_inviter THEN RETURN false; END IF;
  SELECT created_at, device_id INTO v_created, v_dev FROM session_owners WHERE session_id = p_invitee;
  IF v_created IS NULL OR v_created < now() - interval '48 hours' THEN RETURN false; END IF;
  SELECT device_id INTO v_inv_dev FROM session_owners WHERE session_id = p_inviter;
  IF v_inv_dev IS NULL OR v_inv_dev = v_dev THEN RETURN false; END IF;
  -- Device must be new too (not a reinstall of an existing player).
  IF EXISTS (SELECT 1 FROM session_owners WHERE device_id = v_dev AND session_id <> p_invitee) THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM game_players WHERE session_id = p_invitee) THEN RETURN false; END IF;
  INSERT INTO referral_credits (invitee_session_id, inviter_session_id)
  VALUES (p_invitee, p_inviter) ON CONFLICT (invitee_session_id) DO NOTHING;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO referral_rewards (session_id, gold_until, friends_count)
  VALUES (p_inviter, now() + interval '10 days', 1)
  ON CONFLICT (session_id) DO UPDATE
    SET gold_until = greatest(referral_rewards.gold_until, now()) + interval '10 days',
        friends_count = referral_rewards.friends_count + 1, updated_at = now();
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.internal_grant_referral(text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.internal_grant_referral(text, text) TO service_role;