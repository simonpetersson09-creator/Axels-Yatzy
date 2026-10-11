CREATE OR REPLACE FUNCTION public.friend_request_exists(p_session_id text, p_game_id uuid, p_to_index integer)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM game_players gp JOIN friend_requests fr
      ON (fr.from_session_id = p_session_id AND fr.to_session_id = gp.session_id)
      OR (fr.to_session_id = p_session_id AND fr.from_session_id = gp.session_id)
    WHERE gp.game_id = p_game_id AND gp.player_index = p_to_index);
$$;
REVOKE EXECUTE ON FUNCTION public.friend_request_status(text, text[]) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.friend_request_exists(text, uuid, integer) TO anon, authenticated;