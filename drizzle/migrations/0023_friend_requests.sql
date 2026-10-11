CREATE TABLE public.friend_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_session_id text NOT NULL,
  from_name text NOT NULL,
  to_session_id text NOT NULL,
  to_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE (from_session_id, to_session_id)
);
CREATE INDEX friend_requests_to_idx ON public.friend_requests(to_session_id);
GRANT ALL ON public.friend_requests TO service_role;
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "no direct access to friend requests" ON public.friend_requests FOR SELECT USING (false);

CREATE OR REPLACE FUNCTION public.send_friend_request(p_session_id text, p_device_id text, p_game_id uuid, p_to_index integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me record; v_to record;
BEGIN
  IF NOT public.claim_session(p_session_id, p_device_id) THEN RETURN jsonb_build_object('ok', false, 'error', 'auth'); END IF;
  SELECT * INTO v_me FROM game_players WHERE game_id = p_game_id AND session_id = p_session_id LIMIT 1;
  SELECT * INTO v_to FROM game_players WHERE game_id = p_game_id AND player_index = p_to_index AND NOT is_bot LIMIT 1;
  IF v_me IS NULL OR v_to IS NULL OR v_to.session_id = p_session_id THEN RETURN jsonb_build_object('ok', false, 'error', 'not_in_game'); END IF;
  IF EXISTS (SELECT 1 FROM friend_requests WHERE (from_session_id = p_session_id AND to_session_id = v_to.session_id)
             OR (from_session_id = v_to.session_id AND to_session_id = p_session_id)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already');
  END IF;
  INSERT INTO friend_requests(from_session_id, from_name, to_session_id, to_name)
  VALUES (p_session_id, left(v_me.player_name, 40), v_to.session_id, left(v_to.player_name, 40));
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.friend_request_status(p_session_id text, p_other_session_ids text[])
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(DISTINCT CASE WHEN from_session_id = p_session_id THEN to_session_id ELSE from_session_id END), '[]'::jsonb)
  FROM friend_requests
  WHERE (from_session_id = p_session_id AND to_session_id = ANY(p_other_session_ids))
     OR (to_session_id = p_session_id AND from_session_id = ANY(p_other_session_ids));
$$;

CREATE OR REPLACE FUNCTION public.list_friend_requests(p_session_id text, p_device_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.claim_session(p_session_id, p_device_id) THEN RETURN '[]'::jsonb; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'incoming', to_session_id = p_session_id,
      'other_id', CASE WHEN to_session_id = p_session_id THEN from_session_id ELSE to_session_id END,
      'other_name', CASE WHEN to_session_id = p_session_id THEN from_name ELSE to_name END,
      'status', status, 'created_at', created_at) ORDER BY created_at DESC)
    FROM friend_requests
    WHERE (to_session_id = p_session_id AND status = 'pending')
       OR (from_session_id = p_session_id AND created_at > now() - interval '30 days')), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.respond_friend_request(p_id uuid, p_session_id text, p_device_id text, p_accept boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record;
BEGIN
  IF NOT public.claim_session(p_session_id, p_device_id) THEN RETURN jsonb_build_object('ok', false); END IF;
  UPDATE friend_requests SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END, responded_at = now()
  WHERE id = p_id AND to_session_id = p_session_id AND status = 'pending'
  RETURNING from_session_id, from_name INTO v;
  IF v IS NULL THEN RETURN jsonb_build_object('ok', false); END IF;
  RETURN jsonb_build_object('ok', true, 'friend_id', v.from_session_id, 'friend_name', v.from_name);
END $$;

GRANT EXECUTE ON FUNCTION public.send_friend_request(text, text, uuid, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.friend_request_status(text, text[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_friend_requests(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.respond_friend_request(uuid, text, text, boolean) TO anon, authenticated;