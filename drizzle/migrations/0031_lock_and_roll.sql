-- Locks + roll in one database call; a successful roll also counts as "player is active"
-- (so the app no longer needs a separate heartbeat per roll).
CREATE OR REPLACE FUNCTION public.perform_lock_and_roll_authed(p_game_id uuid, p_session_id text, p_device_id text, p_locked boolean[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rolls int;
  v_lock jsonb;
  v_res jsonb;
BEGIN
  IF p_device_id IS NOT NULL AND NOT public.claim_session(p_session_id, p_device_id) THEN
    RETURN jsonb_build_object('success', false, 'auth_failed', true, 'error', 'Fel enhet för spelaren');
  END IF;
  SELECT rolls_left INTO v_rolls FROM games WHERE id = p_game_id;
  -- First roll of a turn resets locks anyway; only apply locks between rolls.
  IF p_locked IS NOT NULL AND v_rolls BETWEEN 1 AND 2 THEN
    v_lock := public.perform_set_locks(p_game_id, p_session_id, p_locked);
    IF NOT coalesce((v_lock->>'success')::boolean, false) THEN
      RETURN v_lock;
    END IF;
  END IF;
  v_res := public.perform_roll_dice(p_game_id, p_session_id, NULL);
  IF coalesce((v_res->>'success')::boolean, false) THEN
    UPDATE game_players SET last_active_at = now(), away = false
    WHERE game_id = p_game_id AND session_id = p_session_id;
  END IF;
  RETURN v_res;
END $$;
REVOKE ALL ON FUNCTION public.perform_lock_and_roll_authed(uuid, text, text, boolean[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.perform_lock_and_roll_authed(uuid, text, text, boolean[]) TO service_role;