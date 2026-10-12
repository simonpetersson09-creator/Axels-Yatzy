-- One round trip per tap: device check (claim_session) + action in the same call.
CREATE OR REPLACE FUNCTION public.perform_roll_dice_authed(p_game_id uuid, p_session_id text, p_device_id text, p_client_dice integer[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_device_id IS NOT NULL AND NOT public.claim_session(p_session_id, p_device_id) THEN
    RETURN jsonb_build_object('success', false, 'auth_failed', true, 'error', 'Fel enhet för spelaren');
  END IF;
  RETURN public.perform_roll_dice(p_game_id, p_session_id, p_client_dice);
END $$;

CREATE OR REPLACE FUNCTION public.perform_set_locks_authed(p_game_id uuid, p_session_id text, p_device_id text, p_locked boolean[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_device_id IS NOT NULL AND NOT public.claim_session(p_session_id, p_device_id) THEN
    RETURN jsonb_build_object('success', false, 'auth_failed', true, 'error', 'Fel enhet för spelaren');
  END IF;
  RETURN public.perform_set_locks(p_game_id, p_session_id, p_locked);
END $$;

REVOKE ALL ON FUNCTION public.perform_roll_dice_authed(uuid, text, text, integer[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.perform_set_locks_authed(uuid, text, text, boolean[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.perform_roll_dice_authed(uuid, text, text, integer[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.perform_set_locks_authed(uuid, text, text, boolean[]) TO service_role;