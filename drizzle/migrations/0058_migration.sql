DO $mig$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.perform_forfeit'::regproc);
  d := replace(d,
    'AND NOT is_bot AND session_id <> p_session_id) THEN',
    'AND NOT is_bot AND session_id <> p_session_id AND NOT away AND last_active_at > now() - interval ''90 seconds'') THEN');
  IF position('90 seconds' in d) = 0 THEN RAISE EXCEPTION 'pattern not found'; END IF;
  EXECUTE d;
END $mig$;