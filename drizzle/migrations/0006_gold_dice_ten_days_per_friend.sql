-- Gold dice: every counted friend gives the inviter +10 days (stacking); friend keeps the 3-day welcome gift.
CREATE OR REPLACE FUNCTION public.internal_award_referral(p_invitee text, p_inviter text, p_game uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF p_invitee IS NULL OR p_inviter IS NULL OR p_invitee = p_inviter THEN RETURN false; END IF;
  INSERT INTO referral_credits (invitee_session_id, inviter_session_id, game_id)
  VALUES (p_invitee, p_inviter, p_game) ON CONFLICT (invitee_session_id) DO NOTHING;
  IF NOT FOUND THEN RETURN false; END IF;

  INSERT INTO referral_rewards (session_id, gold_until, friends_count)
  VALUES (p_inviter, now() + interval '10 days', 1)
  ON CONFLICT (session_id) DO UPDATE
    SET gold_until = greatest(referral_rewards.gold_until, now()) + interval '10 days',
        friends_count = referral_rewards.friends_count + 1,
        updated_at = now();

  INSERT INTO referral_rewards (session_id, gold_until, friends_count)
  VALUES (p_invitee, now() + interval '3 days', 0)
  ON CONFLICT (session_id) DO UPDATE
    SET gold_until = greatest(referral_rewards.gold_until, now() + interval '3 days'), updated_at = now();
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.internal_award_referral(text, text, uuid) FROM PUBLIC, anon, authenticated;