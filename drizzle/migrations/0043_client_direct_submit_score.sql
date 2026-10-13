CREATE OR REPLACE FUNCTION public.client_submit_score(p_game_id uuid, p_session_id text, p_device_id text, p_category_id text, p_expected_dice integer[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF p_session_id IS NULL OR p_device_id IS NULL OR length(p_device_id) NOT BETWEEN 8 AND 64 THEN
    RETURN jsonb_build_object('success', false, 'auth_failed', true, 'error', 'device_id required');
  END IF;
  IF p_category_id IS NULL OR length(p_category_id) > 40 THEN
    RETURN jsonb_build_object('success', false, 'error', 'category_id required');
  END IF;
  IF p_expected_dice IS NOT NULL AND array_length(p_expected_dice, 1) IS DISTINCT FROM 5 THEN
    p_expected_dice := NULL;
  END IF;
  RETURN public.perform_submit_score_authed(p_game_id, p_session_id, p_device_id, p_category_id, p_expected_dice);
END $$;

REVOKE ALL ON FUNCTION public.client_submit_score(uuid, text, text, text, integer[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_submit_score(uuid, text, text, text, integer[]) TO anon, authenticated, service_role;