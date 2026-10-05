-- Gold dice: every 3rd invited friend gives the inviter 30 days; the friend gets a 3-day welcome gift.
CREATE OR REPLACE FUNCTION public.internal_award_referral(p_invitee text, p_inviter text, p_game uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_count int;
BEGIN
  IF p_invitee IS NULL OR p_inviter IS NULL OR p_invitee = p_inviter THEN RETURN false; END IF;
  INSERT INTO referral_credits (invitee_session_id, inviter_session_id, game_id)
  VALUES (p_invitee, p_inviter, p_game) ON CONFLICT (invitee_session_id) DO NOTHING;
  IF NOT FOUND THEN RETURN false; END IF;

  INSERT INTO referral_rewards (session_id, gold_until, friends_count)
  VALUES (p_inviter, now(), 1)
  ON CONFLICT (session_id) DO UPDATE
    SET friends_count = referral_rewards.friends_count + 1, updated_at = now()
  RETURNING friends_count INTO v_count;

  IF v_count % 3 = 0 THEN
    UPDATE referral_rewards
       SET gold_until = greatest(gold_until, now()) + interval '30 days', updated_at = now()
     WHERE session_id = p_inviter;
  END IF;

  INSERT INTO referral_rewards (session_id, gold_until, friends_count)
  VALUES (p_invitee, now() + interval '3 days', 0)
  ON CONFLICT (session_id) DO UPDATE
    SET gold_until = greatest(referral_rewards.gold_until, now() + interval '3 days'), updated_at = now();
  RETURN true;
END $$;

-- Code path (kept for a future "who invited you" prompt) now uses the same reward rules.
CREATE OR REPLACE FUNCTION public.internal_grant_referral(p_invitee text, p_inviter text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_created timestamptz; v_dev text; v_inv_dev text;
BEGIN
  IF p_invitee IS NULL OR p_inviter IS NULL OR p_invitee = p_inviter THEN RETURN false; END IF;
  SELECT created_at, device_id INTO v_created, v_dev FROM session_owners WHERE session_id = p_invitee;
  IF v_created IS NULL OR v_created < now() - interval '48 hours' THEN RETURN false; END IF;
  SELECT device_id INTO v_inv_dev FROM session_owners WHERE session_id = p_inviter;
  IF v_inv_dev IS NULL OR v_inv_dev = v_dev THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM session_owners WHERE device_id = v_dev AND session_id <> p_invitee) THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM game_players WHERE session_id = p_invitee) THEN RETURN false; END IF;
  RETURN public.internal_award_referral(p_invitee, p_inviter, NULL);
END $$;

-- A friend counts once they FINISH their very first friend match with the host.
CREATE OR REPLACE FUNCTION public.trg_referral_on_finish()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_host text; v_host_device text; r record; v_created timestamptz; v_dev text;
BEGIN
  IF NEW.status <> 'finished' OR OLD.status = 'finished' OR NEW.is_quick_match OR NEW.forfeited_by IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT session_id INTO v_host FROM game_players
   WHERE game_id = NEW.id AND player_index = 0 AND NOT is_bot LIMIT 1;
  IF v_host IS NULL THEN RETURN NEW; END IF;
  SELECT device_id INTO v_host_device FROM session_owners WHERE session_id = v_host;
  IF v_host_device IS NULL THEN RETURN NEW; END IF;

  FOR r IN SELECT id, session_id FROM game_players
            WHERE game_id = NEW.id AND player_index > 0 AND NOT is_bot AND session_id <> v_host LOOP
    SELECT created_at, device_id INTO v_created, v_dev FROM session_owners WHERE session_id = r.session_id;
    CONTINUE WHEN v_created IS NULL OR v_created < now() - interval '7 days';
    CONTINUE WHEN v_dev IS NULL OR v_dev = v_host_device;
    CONTINUE WHEN EXISTS (SELECT 1 FROM session_owners WHERE device_id = v_dev AND session_id <> r.session_id);
    CONTINUE WHEN EXISTS (SELECT 1 FROM game_players WHERE session_id = r.session_id AND game_id <> NEW.id);
    PERFORM public.internal_award_referral(r.session_id, v_host, NEW.id);
  END LOOP;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW; -- never block finishing a game
END $$;

DROP TRIGGER IF EXISTS referral_credit_on_join ON public.game_players;
DROP TRIGGER IF EXISTS referral_on_finish ON public.games;
CREATE TRIGGER referral_on_finish AFTER UPDATE OF status ON public.games
  FOR EACH ROW EXECUTE FUNCTION public.trg_referral_on_finish();

CREATE OR REPLACE FUNCTION public.get_gold_dice(p_session_id text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(
    (SELECT jsonb_build_object(
        'gold_until', CASE WHEN gold_until > now() THEN gold_until END,
        'friends', friends_count,
        'progress', friends_count % 3)
       FROM referral_rewards WHERE session_id = p_session_id),
    jsonb_build_object('gold_until', null, 'friends', 0, 'progress', 0));
$$;

-- Which of these players currently have gold dice (shown to opponents).
CREATE OR REPLACE FUNCTION public.get_gold_players(p_session_ids text[])
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(array_agg(session_id), '{}')
    FROM referral_rewards
   WHERE session_id = ANY (p_session_ids[1:8]) AND gold_until > now();
$$;

REVOKE ALL ON FUNCTION public.internal_award_referral(text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.internal_grant_referral(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_referral_on_finish() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_gold_dice(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_gold_players(text[]) TO anon, authenticated;