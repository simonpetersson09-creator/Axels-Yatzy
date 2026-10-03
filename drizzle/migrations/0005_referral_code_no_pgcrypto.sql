CREATE OR REPLACE FUNCTION public.get_referral_code(p_session_id text, p_device_id text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code text; i int; j int; chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
BEGIN
  IF NOT public.claim_session(p_session_id, p_device_id) THEN RETURN NULL; END IF;
  SELECT code INTO v_code FROM referral_codes WHERE session_id = p_session_id;
  IF v_code IS NOT NULL THEN RETURN v_code; END IF;
  FOR i IN 1..10 LOOP
    v_code := '';
    FOR j IN 1..6 LOOP
      v_code := v_code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    END LOOP;
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