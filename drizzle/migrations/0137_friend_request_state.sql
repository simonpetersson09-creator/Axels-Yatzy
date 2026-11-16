CREATE OR REPLACE FUNCTION public.friend_request_state(p_session_id text, p_game_id uuid, p_to_index integer)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT CASE WHEN bool_or(fr.status = 'accepted') THEN 'friends' ELSE 'sent' END
     FROM game_players gp JOIN friend_requests fr
       ON (fr.from_session_id = p_session_id AND fr.to_session_id = gp.session_id)
       OR (fr.to_session_id = p_session_id AND fr.from_session_id = gp.session_id)
     WHERE gp.game_id = p_game_id AND gp.player_index = p_to_index
     HAVING count(*) > 0),
    'none');
$$;
GRANT EXECUTE ON FUNCTION public.friend_request_state(text, uuid, integer) TO anon, authenticated, service_role;