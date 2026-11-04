CREATE OR REPLACE FUNCTION public.client_roll(p_game_id uuid, p_session_id text, p_device_id text, p_locked boolean[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_started timestamptz := clock_timestamp();
  v_result jsonb;
BEGIN
  IF p_session_id IS NULL OR p_device_id IS NULL OR length(p_device_id) NOT BETWEEN 8 AND 64 THEN
    v_result := jsonb_build_object('success', false, 'auth_failed', true, 'error', 'device_id required');
  ELSIF p_locked IS NOT NULL AND array_length(p_locked, 1) IS DISTINCT FROM 5 THEN
    v_result := jsonb_build_object('success', false, 'error', 'locked[5] required');
  ELSE
    v_result := public.perform_lock_and_roll_authed(p_game_id, p_session_id, p_device_id, p_locked);
  END IF;
  RETURN v_result || jsonb_build_object('server_ms', greatest(0, round(extract(epoch FROM (clock_timestamp() - v_started)) * 1000)));
END $$;
REVOKE ALL ON FUNCTION public.client_roll(uuid,text,text,boolean[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_roll(uuid,text,text,boolean[]) TO anon, authenticated, service_role;