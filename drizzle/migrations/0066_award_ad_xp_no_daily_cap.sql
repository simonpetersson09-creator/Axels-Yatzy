CREATE OR REPLACE FUNCTION public.award_ad_xp(p_session_id text, p_device_id text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r player_xp%ROWTYPE;
BEGIN
  IF NOT public.claim_session(p_session_id, p_device_id) THEN RETURN jsonb_build_object('ok', false, 'reason', 'auth'); END IF;
  INSERT INTO player_xp (session_id) VALUES (p_session_id) ON CONFLICT DO NOTHING;
  SELECT * INTO r FROM player_xp WHERE session_id = p_session_id FOR UPDATE;
  IF r.earned_day <> current_date THEN r.earned_today := 0; END IF;
  -- No daily cap; the 15 s cooldown still blocks scripted spamming.
  IF r.last_earned_at IS NOT NULL AND r.last_earned_at > now() - interval '15 seconds' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cooldown', 'xp', r.xp);
  END IF;
  UPDATE player_xp SET xp = xp + 1, earned_today = r.earned_today + 1, earned_day = current_date,
    last_earned_at = now(), updated_at = now()
  WHERE session_id = p_session_id RETURNING * INTO r;
  RETURN jsonb_build_object('ok', true, 'xp', r.xp, 'earned_today', r.earned_today);
END $function$;