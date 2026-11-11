ALTER TABLE public.game_invites ADD COLUMN lobby_invite boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.game_invites.lobby_invite IS 'Keeps created-lobby invites distinct even if game cleanup clears game_id';
CREATE OR REPLACE FUNCTION public.internal_send_lobby_invites(p_game_id uuid, p_session_id text, p_device_id text, p_recipients text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_game games%ROWTYPE; v_ids text[]; v_new text[]; v_count integer; v_pending integer; v_name text; v_result jsonb;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM session_owners WHERE session_id=p_session_id AND device_id=p_device_id) THEN RETURN jsonb_build_object('success',false,'error','Ogiltig avsändare'); END IF;
 SELECT * INTO v_game FROM games WHERE id=p_game_id FOR UPDATE;
 IF v_game.id IS NULL OR v_game.status<>'waiting' OR v_game.is_quick_match OR NOT EXISTS (SELECT 1 FROM game_players WHERE game_id=p_game_id AND session_id=p_session_id AND player_index=0) THEN RETURN jsonb_build_object('success',false,'error','Bara värden kan bjuda in till ett väntande spel'); END IF;
 SELECT array_agg(DISTINCT x) INTO v_ids FROM unnest(p_recipients) x;
 IF coalesce(cardinality(v_ids),0) NOT BETWEEN 1 AND 3 OR p_session_id=ANY(v_ids) OR EXISTS (SELECT 1 FROM unnest(p_recipients) x WHERE x IS NULL) THEN RETURN jsonb_build_object('success',false,'error','Välj högst tre vänner'); END IF;
 IF EXISTS (SELECT 1 FROM unnest(v_ids) x WHERE NOT EXISTS (SELECT 1 FROM friend_requests WHERE status='accepted' AND ((from_session_id=p_session_id AND to_session_id=x) OR (to_session_id=p_session_id AND from_session_id=x))) OR NOT EXISTS (SELECT 1 FROM session_owners WHERE session_id=x)) THEN RETURN jsonb_build_object('success',false,'error','Välj bara godkända vänner'); END IF;
 SELECT array_agg(x) INTO v_new FROM unnest(v_ids) x WHERE NOT EXISTS (SELECT 1 FROM game_players WHERE game_id=p_game_id AND session_id=x) AND NOT EXISTS (SELECT 1 FROM game_invites WHERE game_id=p_game_id AND lobby_invite AND to_session_id=x AND status='pending' AND expires_at>now());
 SELECT count(*) INTO v_count FROM game_players WHERE game_id=p_game_id;
 SELECT count(DISTINCT to_session_id) INTO v_pending FROM game_invites i WHERE game_id=p_game_id AND lobby_invite AND status='pending' AND expires_at>now() AND NOT EXISTS (SELECT 1 FROM game_players WHERE game_id=p_game_id AND session_id=i.to_session_id);
 IF v_count+v_pending+coalesce(cardinality(v_new),0)>v_game.max_players THEN RETURN jsonb_build_object('success',false,'error','Det finns inte tillräckligt många lediga platser'); END IF;
 IF coalesce(cardinality(v_new),0)>0 THEN
 IF NOT public.check_rate_limit('invite_device:'||p_device_id,20) THEN RETURN jsonb_build_object('success',false,'error','Försök igen om en stund'); END IF;
 IF EXISTS (SELECT 1 FROM unnest(v_new) x WHERE NOT public.check_rate_limit('invite_to:'||x,20)) THEN RAISE EXCEPTION 'För många inbjudningar. Försök igen om en stund.'; END IF;
 SELECT player_name INTO v_name FROM game_players WHERE game_id=p_game_id AND player_index=0;
 INSERT INTO game_invites(from_session_id,from_name,to_session_id,to_name,game_id,lobby_invite) SELECT p_session_id,v_name,x,coalesce((SELECT name FROM player_names WHERE session_id=x),(SELECT CASE WHEN from_session_id=x THEN from_name ELSE to_name END FROM friend_requests WHERE status='accepted' AND ((from_session_id=p_session_id AND to_session_id=x) OR (to_session_id=p_session_id AND from_session_id=x)) LIMIT 1),'Spelare'),p_game_id,true FROM unnest(v_new) x;
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'to_session_id',to_session_id,'from_name',from_name)),'[]'::jsonb) INTO v_result FROM game_invites WHERE game_id=p_game_id AND lobby_invite AND status='pending' AND expires_at>now() AND to_session_id=ANY(v_new);
 RETURN jsonb_build_object('success',true,'invites',v_result);
END;
$function$;
REVOKE ALL ON FUNCTION public.internal_send_lobby_invites(uuid,text,text,text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.internal_send_lobby_invites(uuid,text,text,text[]) TO service_role;
CREATE OR REPLACE FUNCTION public.accept_invite(p_invite_id uuid, p_session_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_invite RECORD; v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; v_code TEXT; v_game RECORD; v_attempt INTEGER := 0; v_active_from INTEGER; v_active_to INTEGER; v_existing RECORD;
BEGIN
 SELECT * INTO v_invite FROM game_invites WHERE id=p_invite_id FOR UPDATE;
 IF v_invite IS NULL THEN RETURN jsonb_build_object('success',false,'error','Inbjudan finns inte'); END IF;
 IF v_invite.to_session_id<>p_session_id THEN RETURN jsonb_build_object('success',false,'error','Inbjudan är inte till dig'); END IF;
 IF v_invite.lobby_invite THEN
 IF v_invite.game_id IS NULL THEN RETURN jsonb_build_object('success',false,'error','Spelet finns inte längre'); END IF;
 SELECT * INTO v_game FROM games WHERE id=v_invite.game_id FOR UPDATE;
 IF v_game.id IS NULL OR v_game.status='finished' THEN RETURN jsonb_build_object('success',false,'error','Spelet har avslutats'); END IF;
 IF v_invite.status='accepted' AND EXISTS (SELECT 1 FROM game_players WHERE game_id=v_game.id AND session_id=p_session_id) THEN RETURN jsonb_build_object('success',true,'game_id',v_game.id,'game_code',v_game.game_code); END IF;
 IF v_invite.status<>'pending' OR v_invite.expires_at<=now() THEN RETURN jsonb_build_object('success',false,'error','Inbjudan är inte längre aktiv'); END IF;
 IF NOT EXISTS (SELECT 1 FROM game_players WHERE game_id=v_game.id AND player_index=0 AND session_id=v_invite.from_session_id) THEN RETURN jsonb_build_object('success',false,'error','Ogiltig värd'); END IF;
 SELECT count(DISTINCT gp.game_id) INTO v_active_to FROM game_players gp JOIN games g ON g.id=gp.game_id WHERE gp.session_id=p_session_id AND g.status IN ('waiting','playing') AND g.id<>v_game.id;
 IF v_active_to>=3 THEN RETURN jsonb_build_object('success',false,'error','max_active_games'); END IF;
 SELECT public.join_game(v_game.game_code,v_invite.to_name,p_session_id) AS result INTO v_existing;
 IF NOT (v_existing.result->>'success')::boolean THEN RETURN v_existing.result; END IF;
 UPDATE game_invites SET status='accepted',responded_at=now() WHERE id=p_invite_id;
 RETURN jsonb_build_object('success',true,'game_id',v_game.id,'game_code',v_game.game_code);
 END IF;
 IF v_invite.status='accepted' AND v_invite.game_id IS NOT NULL THEN
 SELECT id,game_code INTO v_game FROM games WHERE id=v_invite.game_id AND status='playing';
 IF v_game.id IS NOT NULL THEN RETURN jsonb_build_object('success',true,'game_id',v_game.id,'game_code',v_game.game_code); END IF;
 END IF;
 IF v_invite.status<>'pending' THEN RETURN jsonb_build_object('success',false,'error','Inbjudan är inte längre aktiv'); END IF;
 IF v_invite.expires_at<now() THEN UPDATE game_invites SET status='expired' WHERE id=p_invite_id; RETURN jsonb_build_object('success',false,'error','Inbjudan har gått ut'); END IF;
 PERFORM pg_advisory_xact_lock(hashtext('invite_pair:'||least(v_invite.from_session_id,v_invite.to_session_id)||':'||greatest(v_invite.from_session_id,v_invite.to_session_id)));
 SELECT g.id,g.game_code INTO v_existing FROM game_invites i JOIN games g ON g.id=i.game_id WHERE i.status='accepted' AND i.id<>p_invite_id AND i.responded_at>now()-interval '10 minutes' AND ((i.from_session_id=v_invite.from_session_id AND i.to_session_id=v_invite.to_session_id) OR (i.from_session_id=v_invite.to_session_id AND i.to_session_id=v_invite.from_session_id)) AND g.status='playing' AND g.round=1 ORDER BY i.responded_at DESC LIMIT 1;
 IF v_existing.id IS NOT NULL THEN UPDATE game_invites SET status='accepted',game_id=v_existing.id,responded_at=now() WHERE id=p_invite_id; RETURN jsonb_build_object('success',true,'game_id',v_existing.id,'game_code',v_existing.game_code); END IF;
 SELECT count(*) FILTER (WHERE gp.session_id=v_invite.from_session_id),count(*) FILTER (WHERE gp.session_id=v_invite.to_session_id) INTO v_active_from,v_active_to FROM game_players gp JOIN games g ON g.id=gp.game_id WHERE gp.session_id IN (v_invite.from_session_id,v_invite.to_session_id) AND g.status IN ('waiting','playing');
 IF v_active_from>=3 THEN RETURN jsonb_build_object('success',false,'error',v_invite.from_name||' har redan 3 aktiva spel'); END IF;
 IF v_active_to>=3 THEN RETURN jsonb_build_object('success',false,'error','Du har redan 3 aktiva spel'); END IF;
 LOOP
 v_attempt:=v_attempt+1;
 IF v_attempt>10 THEN RETURN jsonb_build_object('success',false,'error','Kunde inte skapa spel'); END IF;
 v_code:=''; FOR i IN 1..6 LOOP v_code:=v_code||substr(v_chars,floor(random()*length(v_chars)+1)::int,1); END LOOP;
 BEGIN INSERT INTO games(game_code,status,max_players) VALUES(v_code,'playing',2) RETURNING * INTO v_game; EXIT; EXCEPTION WHEN unique_violation THEN CONTINUE; END;
 END LOOP;
 INSERT INTO game_players(game_id,player_name,player_index,session_id) VALUES(v_game.id,v_invite.from_name,0,v_invite.from_session_id),(v_game.id,v_invite.to_name,1,v_invite.to_session_id);
 UPDATE game_invites SET status='accepted',game_id=v_game.id,responded_at=now() WHERE id=p_invite_id;
 UPDATE game_invites SET status='accepted',game_id=v_game.id,responded_at=now() WHERE status='pending' AND from_session_id=v_invite.to_session_id AND to_session_id=v_invite.from_session_id;
 RETURN jsonb_build_object('success',true,'game_id',v_game.id,'game_code',v_game.game_code);
END;
$function$;