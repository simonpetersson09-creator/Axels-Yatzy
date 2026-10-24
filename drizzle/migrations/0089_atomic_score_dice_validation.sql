CREATE OR REPLACE FUNCTION public.perform_submit_score_authed(p_game_id uuid, p_session_id text, p_device_id text, p_category_id text, p_expected_dice integer[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_dice integer[];
BEGIN
  IF p_device_id IS NOT NULL AND NOT public.claim_session(p_session_id, p_device_id) THEN
    RETURN jsonb_build_object('success', false, 'auth_failed', true, 'error', 'Fel enhet för spelaren');
  END IF;
  IF p_expected_dice IS NOT NULL THEN
    -- Validate and score under the same row lock so a concurrent roll cannot
    -- change the dice between the comparison and perform_submit_score.
    SELECT dice INTO v_dice FROM public.games WHERE id = p_game_id FOR UPDATE;
    IF v_dice IS DISTINCT FROM p_expected_dice THEN
      RETURN jsonb_build_object('success', false, 'dice_mismatch', true, 'dice', to_jsonb(coalesce(v_dice, '{}'::integer[])));
    END IF;
  END IF;
  RETURN public.perform_submit_score(p_game_id, p_session_id, p_category_id);
END $function$;
REVOKE ALL ON FUNCTION public.perform_submit_score_authed(uuid, text, text, text, integer[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.perform_submit_score_authed(uuid, text, text, text, integer[]) TO service_role;