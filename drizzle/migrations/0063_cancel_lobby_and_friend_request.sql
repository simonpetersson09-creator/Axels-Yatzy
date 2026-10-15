CREATE OR REPLACE FUNCTION public.cancel_friend_request(p_id uuid, p_session_id text, p_device_id text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_n integer;
BEGIN
  IF NOT public.claim_session(p_session_id, p_device_id) THEN RETURN jsonb_build_object('ok', false); END IF;
  DELETE FROM friend_requests WHERE id = p_id AND from_session_id = p_session_id AND status = 'pending';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', v_n > 0);
END $$;
GRANT EXECUTE ON FUNCTION public.cancel_friend_request(uuid, text, text) TO anon, authenticated;

-- Close my own waiting room while nobody else has joined.
CREATE OR REPLACE FUNCTION public.cancel_lobby(p_game_id uuid, p_session_id text, p_device_id text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_n integer;
BEGIN
  IF NOT public.claim_session(p_session_id, p_device_id) THEN RETURN jsonb_build_object('ok', false); END IF;
  UPDATE games g SET status = 'finished'::public.game_status, forfeited_by = COALESCE(g.forfeited_by, 'Ej accepterad')
  WHERE g.id = p_game_id AND g.status = 'waiting'::public.game_status
    AND EXISTS (SELECT 1 FROM game_players gp WHERE gp.game_id = g.id AND gp.session_id = p_session_id)
    AND (SELECT count(*) FROM game_players gp WHERE gp.game_id = g.id) < 2;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', v_n > 0);
END $$;
GRANT EXECUTE ON FUNCTION public.cancel_lobby(uuid, text, text) TO anon, authenticated;