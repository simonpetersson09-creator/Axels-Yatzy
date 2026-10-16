CREATE OR REPLACE FUNCTION public.trg_referral_xp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO player_xp (session_id, xp) VALUES (NEW.inviter_session_id, 1)
  ON CONFLICT (session_id) DO UPDATE SET xp = player_xp.xp + 1, updated_at = now();
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.trg_referral_xp() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS referral_xp ON public.referral_credits;
CREATE TRIGGER referral_xp AFTER INSERT ON public.referral_credits
FOR EACH ROW EXECUTE FUNCTION public.trg_referral_xp();