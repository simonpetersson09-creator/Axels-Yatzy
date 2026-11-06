CREATE OR REPLACE FUNCTION public.internal_archive_admin_game() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
 INSERT INTO admin_match_archive VALUES (OLD.id,OLD.updated_at,OLD.status::text,CASE WHEN OLD.forfeited_by IS NOT NULL THEN 'marked' END,CASE WHEN OLD.forfeited_by_session_id IS NOT NULL THEN 'marked' END,'server')
 ON CONFLICT(game_id) DO UPDATE SET activity_at=EXCLUDED.activity_at,status=EXCLUDED.status,forfeited_by=EXCLUDED.forfeited_by,forfeited_by_session_id=EXCLUDED.forfeited_by_session_id,source='server';
 INSERT INTO admin_match_archive_players SELECT OLD.id,p.session_id FROM game_players p JOIN session_owners so USING(session_id) WHERE p.game_id=OLD.id AND NOT p.is_bot ON CONFLICT DO NOTHING;
 INSERT INTO admin_activity_archive(device_id,day,played)
 SELECT so.device_id,(OLD.updated_at AT TIME ZONE 'Europe/Stockholm')::date,OLD.status='playing' OR (OLD.status='finished' AND OLD.forfeited_by IS NULL AND OLD.forfeited_by_session_id IS NULL)
 FROM game_players p JOIN session_owners so USING(session_id) WHERE p.game_id=OLD.id AND NOT p.is_bot GROUP BY so.device_id
 ON CONFLICT(device_id,day) DO UPDATE SET played=admin_activity_archive.played OR EXCLUDED.played;
 INSERT INTO admin_activity_archive(device_id,day,played)
 SELECT DISTINCT so.device_id,(l.created_at AT TIME ZONE 'Europe/Stockholm')::date,true
 FROM dice_roll_log l JOIN game_players p ON p.game_id=l.game_id AND p.player_index=l.player_index AND NOT p.is_bot JOIN session_owners so USING(session_id) WHERE l.game_id=OLD.id
 ON CONFLICT(device_id,day) DO UPDATE SET played=true;
 RETURN OLD;
END;$function$;
REVOKE ALL ON FUNCTION public.internal_archive_admin_game() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.internal_archive_admin_game() TO service_role;