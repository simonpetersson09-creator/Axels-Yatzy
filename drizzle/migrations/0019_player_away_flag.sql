ALTER TABLE public.game_players ADD COLUMN IF NOT EXISTS away boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.heartbeat(p_game_id uuid, p_session_id text)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  UPDATE game_players SET last_active_at = now(), away = false
  WHERE game_id = p_game_id AND session_id = p_session_id;
$function$;

-- Marks the player as having left the match screen (app backgrounded / left match).
-- Only affects whether a turn notification is sent; never touches last_active_at,
-- so quick-match takeover timing is unchanged.
CREATE OR REPLACE FUNCTION public.set_away(p_game_id uuid, p_session_id text)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  UPDATE game_players SET away = true
  WHERE game_id = p_game_id AND session_id = p_session_id;
$function$;
GRANT EXECUTE ON FUNCTION public.set_away(uuid, text) TO anon, authenticated;