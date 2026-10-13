CREATE OR REPLACE FUNCTION public.client_start_game(p_game_id uuid, p_session_id text, p_device_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF p_session_id IS NULL OR p_device_id IS NULL OR length(p_device_id) NOT BETWEEN 8 AND 64 THEN
    RETURN jsonb_build_object('success', false, 'auth_failed', true, 'error', 'device_id required');
  END IF;
  RETURN public.perform_start_game_authed(p_game_id, p_session_id, p_device_id);
END $$;
REVOKE ALL ON FUNCTION public.client_start_game(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_start_game(uuid, text, text) TO anon, authenticated, service_role;