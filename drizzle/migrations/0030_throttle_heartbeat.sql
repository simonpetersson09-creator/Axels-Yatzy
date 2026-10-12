-- Only write when something changes: coming back (away) or >30 s since last write.
-- Each write fans out as a realtime change that makes every phone refetch the match.
CREATE OR REPLACE FUNCTION public.heartbeat(p_game_id uuid, p_session_id text)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  UPDATE game_players SET last_active_at = now(), away = false
  WHERE game_id = p_game_id AND session_id = p_session_id
    AND (away = true OR last_active_at < now() - interval '30 seconds');
$function$;