-- Direct (no edge function) roll and lock calls for new app versions.
-- Device id is REQUIRED here (proof of identity); the server always rolls.
CREATE OR REPLACE FUNCTION public.client_roll(p_game_id uuid, p_session_id text, p_device_id text, p_locked boolean[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF p_session_id IS NULL OR p_device_id IS NULL OR length(p_device_id) NOT BETWEEN 8 AND 64 THEN
    RETURN jsonb_build_object('success', false, 'auth_failed', true, 'error', 'device_id required');
  END IF;
  IF p_locked IS NOT NULL AND array_length(p_locked, 1) IS DISTINCT FROM 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'locked[5] required');
  END IF;
  RETURN public.perform_lock_and_roll_authed(p_game_id, p_session_id, p_device_id, p_locked);
END $$;

CREATE OR REPLACE FUNCTION public.client_set_locks(p_game_id uuid, p_session_id text, p_device_id text, p_locked boolean[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_res jsonb;
BEGIN
  IF p_session_id IS NULL OR p_device_id IS NULL OR length(p_device_id) NOT BETWEEN 8 AND 64 THEN
    RETURN jsonb_build_object('success', false, 'auth_failed', true, 'error', 'device_id required');
  END IF;
  IF p_locked IS NULL OR array_length(p_locked, 1) IS DISTINCT FROM 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'locked[5] required');
  END IF;
  v_res := public.perform_set_locks_authed(p_game_id, p_session_id, p_device_id, p_locked);
  IF coalesce((v_res->>'success')::boolean, false) THEN
    UPDATE game_players SET last_active_at = now(), away = false
    WHERE game_id = p_game_id AND session_id = p_session_id
      AND (away OR last_active_at < now() - interval '10 seconds');
  END IF;
  RETURN v_res;
END $$;

REVOKE ALL ON FUNCTION public.client_roll(uuid, text, text, boolean[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.client_set_locks(uuid, text, text, boolean[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_roll(uuid, text, text, boolean[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.client_set_locks(uuid, text, text, boolean[]) TO anon, authenticated, service_role;