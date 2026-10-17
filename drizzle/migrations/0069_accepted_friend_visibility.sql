CREATE OR REPLACE FUNCTION public.list_friend_requests(p_session_id text, p_device_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF NOT public.claim_session(p_session_id,p_device_id) THEN RETURN '[]'::jsonb; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'incoming',to_session_id=p_session_id,'other_id',CASE WHEN to_session_id=p_session_id THEN from_session_id ELSE to_session_id END,'other_name',CASE WHEN to_session_id=p_session_id THEN from_name ELSE to_name END,'status',status,'created_at',created_at) ORDER BY created_at DESC) FROM public.friend_requests WHERE (from_session_id=p_session_id OR to_session_id=p_session_id) AND (status IN ('accepted','pending') OR created_at > now()-interval '30 days')), '[]'::jsonb);
END $$;
GRANT EXECUTE ON FUNCTION public.list_friend_requests(text,text) TO anon, authenticated;
CREATE OR REPLACE FUNCTION public.get_accepted_friend_matches(p_session_id text,p_device_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.claim_session(p_session_id,p_device_id) THEN RETURN '[]'::jsonb; END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.created_at DESC) FROM (SELECT r.* FROM public.friend_match_results r WHERE (r.player_1_id=p_session_id OR r.player_2_id=p_session_id) AND EXISTS (SELECT 1 FROM public.friend_requests f WHERE f.status='accepted' AND ((f.from_session_id=r.player_1_id AND f.to_session_id=r.player_2_id) OR (f.from_session_id=r.player_2_id AND f.to_session_id=r.player_1_id))) ORDER BY r.created_at DESC LIMIT 500) m),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.get_accepted_friend_matches(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_accepted_friend_matches(text,text) TO anon, authenticated, service_role;