CREATE TABLE public.waiting_room_expiry_notices (
 session_id text PRIMARY KEY REFERENCES public.session_owners(session_id) ON DELETE CASCADE,
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 seat_id uuid NOT NULL,
 player_names text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.waiting_room_expiry_notices TO service_role;
ALTER TABLE public.waiting_room_expiry_notices ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.internal_waiting_room_reconcile()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_changed boolean := false; v_count integer; v_all boolean; v_start timestamptz; v_game uuid; v_code text; v_attempt integer := 0;
BEGIN
 PERFORM pg_advisory_xact_lock(742001);
 DELETE FROM waiting_room_expiry_notices WHERE created_at<now()-interval '30 days';
 INSERT INTO waiting_room_state(id) VALUES(1) ON CONFLICT DO NOTHING;
 UPDATE waiting_room_seats SET present=false,ready=false WHERE game_id IS NULL AND present AND last_seen_at<=now()-interval '25 seconds';
 v_changed:=FOUND;
 SELECT count(*) INTO v_count FROM waiting_room_seats WHERE game_id IS NULL;
 IF v_count>1 THEN
   INSERT INTO waiting_room_expiry_notices(session_id,seat_id,player_names)
   SELECT s.session_id,s.id,coalesce((SELECT string_agg(other.player_name, ', ' ORDER BY other.seat)
     FROM waiting_room_seats other WHERE other.game_id IS NULL AND other.id<>s.id),'')
   FROM waiting_room_seats s JOIN session_owners o ON o.session_id=s.session_id
   WHERE s.game_id IS NULL AND NOT s.present AND NOT s.ready AND s.recall_until<=now()
   ON CONFLICT(session_id) DO UPDATE SET id=gen_random_uuid(),seat_id=excluded.seat_id,player_names=excluded.player_names,created_at=now();
   DELETE FROM waiting_room_seats WHERE game_id IS NULL AND NOT present AND NOT ready AND recall_until<=now();
   v_changed:=v_changed OR FOUND;
 END IF;
 DELETE FROM waiting_room_seats s WHERE s.game_id IS NOT NULL AND
   (s.matched_at<now()-interval '24 hours' OR EXISTS
     (SELECT 1 FROM games g WHERE g.id=s.game_id AND g.status='finished'));
 SELECT count(*) INTO v_count FROM waiting_room_seats WHERE game_id IS NULL;
 IF v_count<=1 THEN
   UPDATE waiting_room_seats SET solo_until=greatest(joined_at,last_seen_at)+interval '2 hours' WHERE game_id IS NULL AND solo_until IS NULL;
   DELETE FROM waiting_room_seats WHERE game_id IS NULL AND solo_until<=now();
   v_changed:=v_changed OR FOUND;
   SELECT count(*) INTO v_count FROM waiting_room_seats WHERE game_id IS NULL;
 ELSE
   UPDATE waiting_room_seats SET solo_until=NULL WHERE game_id IS NULL AND solo_until IS NOT NULL;
 END IF;
 SELECT countdown_at INTO v_start FROM waiting_room_state WHERE id=1;
 SELECT count(*)>=2 AND coalesce(bool_and(ready AND present AND last_seen_at>now()-interval '25 seconds'),false) INTO v_all FROM waiting_room_seats WHERE game_id IS NULL;
 IF v_start IS NOT NULL AND (v_changed OR NOT v_all) THEN
   UPDATE waiting_room_state SET countdown_at=NULL,revision=revision+1 WHERE id=1;
   UPDATE waiting_room_seats SET ready=false WHERE game_id IS NULL;
 ELSIF v_start IS NOT NULL AND v_all AND now()>=v_start+interval '3 seconds' THEN
   LOOP
     v_attempt:=v_attempt+1;
     IF v_attempt>10 THEN RAISE EXCEPTION 'room_match_creation_failed'; END IF;
     v_code:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
     BEGIN
       INSERT INTO games(game_code,status,max_players,is_quick_match) VALUES(v_code,'playing',v_count,false) RETURNING id INTO v_game;
       EXIT;
     EXCEPTION WHEN unique_violation THEN CONTINUE;
     END;
   END LOOP;
   INSERT INTO game_players(game_id,player_name,player_index,session_id)
   SELECT v_game,player_name,(row_number() OVER(ORDER BY seat)-1)::integer,session_id FROM waiting_room_seats WHERE game_id IS NULL;
   UPDATE waiting_room_seats SET game_id=v_game,matched_at=now(),ready=false,present=false,recall_until=NULL,recall_id=NULL WHERE game_id IS NULL;
   UPDATE waiting_room_state SET countdown_at=NULL,revision=revision+1 WHERE id=1;
 ELSIF v_start IS NULL AND v_all AND NOT v_changed THEN
   UPDATE waiting_room_state SET countdown_at=now(),revision=revision+1 WHERE id=1;
 END IF;
 SELECT count(*) INTO v_count FROM waiting_room_seats WHERE game_id IS NULL;
 IF v_count<=1 THEN
   UPDATE waiting_room_seats SET recall_until=NULL,recall_id=NULL WHERE game_id IS NULL AND (recall_until IS NOT NULL OR recall_id IS NOT NULL);
 ELSE
   UPDATE waiting_room_seats SET recall_until=NULL,recall_id=NULL WHERE game_id IS NULL AND (present OR ready) AND (recall_until IS NOT NULL OR recall_id IS NOT NULL);
   UPDATE waiting_room_seats SET recall_until=now()+interval '120 seconds' WHERE game_id IS NULL AND NOT present AND NOT ready AND recall_until IS NULL;
   UPDATE waiting_room_seats SET recall_id=gen_random_uuid() WHERE game_id IS NULL AND NOT present AND NOT ready AND recall_id IS NULL;
   INSERT INTO waiting_room_push_queue(id,seat_id,expires_at)
   SELECT recall_id,id,recall_until FROM waiting_room_seats WHERE game_id IS NULL AND NOT present AND NOT ready AND notify_enabled AND recall_id IS NOT NULL ON CONFLICT DO NOTHING;
 END IF;
 DELETE FROM waiting_room_push_queue q WHERE q.expires_at<=now() OR NOT EXISTS
 (SELECT 1 FROM waiting_room_seats s WHERE s.id=q.seat_id AND s.game_id IS NULL AND NOT s.present AND NOT s.ready AND s.notify_enabled AND s.recall_id=q.id AND s.recall_until>now());
END $function$;
CREATE OR REPLACE FUNCTION public.waiting_room_action(p_session_id text, p_device_id text, p_action text DEFAULT 'sync'::text, p_seat_id uuid DEFAULT NULL::uuid, p_name text DEFAULT NULL::text, p_ready boolean DEFAULT false, p_notify boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_seat waiting_room_seats%ROWTYPE; v_slot integer; v_error text; v_start timestamptz; v_registered boolean;
BEGIN
 IF NOT claim_session(p_session_id,p_device_id) THEN RAISE EXCEPTION 'room_identity_denied'; END IF;
 PERFORM pg_advisory_xact_lock(742001);
 IF p_action IN ('away','leave') THEN
   UPDATE waiting_room_seats SET present=false,ready=false WHERE session_id=p_session_id AND game_id IS NULL AND (p_seat_id IS NULL OR id=p_seat_id);
 END IF;
 PERFORM internal_waiting_room_reconcile();
 IF p_seat_id IS NOT NULL THEN SELECT * INTO v_seat FROM waiting_room_seats WHERE id=p_seat_id AND session_id=p_session_id;
 ELSE SELECT * INTO v_seat FROM waiting_room_seats WHERE session_id=p_session_id AND game_id IS NULL; END IF;
 SELECT countdown_at INTO v_start FROM waiting_room_state WHERE id=1;
 IF p_action='join' THEN
   IF v_seat.id IS NULL THEN
     IF v_start IS NOT NULL THEN v_error:='starting';
     ELSE
       SELECT i INTO v_slot FROM (VALUES (2,1),(0,2),(1,3),(3,4)) AS v(i,prio) WHERE NOT EXISTS (SELECT 1 FROM waiting_room_seats WHERE game_id IS NULL AND seat=i) ORDER BY prio LIMIT 1;
       IF v_slot IS NULL THEN v_error:='full';
       ELSE INSERT INTO waiting_room_seats(session_id,player_name,seat) VALUES(p_session_id,left(coalesce(nullif(trim(p_name),''),'Spelare'),20),v_slot) RETURNING * INTO v_seat; END IF;
     END IF;
   END IF;
 ELSIF p_action NOT IN ('sync','heartbeat','ready','away','leave','extend','notify','open') THEN RAISE EXCEPTION 'room_invalid_action'; END IF;
 IF p_seat_id IS NOT NULL AND v_seat.id IS NULL THEN v_error:='expired'; END IF;
 IF v_seat.id IS NOT NULL AND v_seat.game_id IS NULL THEN
   IF p_action='leave' THEN
     DELETE FROM waiting_room_seats WHERE id=v_seat.id;
     UPDATE waiting_room_state SET countdown_at=NULL,revision=revision+1 WHERE id=1;
     UPDATE waiting_room_seats SET ready=false WHERE game_id IS NULL;
     v_seat.id:=NULL;
   ELSIF p_action='away' THEN UPDATE waiting_room_seats SET present=false,ready=false WHERE id=v_seat.id;
   ELSIF p_action IN ('heartbeat','open','join') THEN UPDATE waiting_room_seats SET present=true,last_seen_at=now(),solo_until=now()+interval '2 hours' WHERE id=v_seat.id;
   ELSIF p_action='extend' THEN NULL;
   ELSIF p_action='ready' THEN
     IF v_start IS NOT NULL THEN v_error:='starting';
     ELSIF NOT v_seat.present THEN v_error:='away';
     ELSE UPDATE waiting_room_seats SET ready=p_ready,last_seen_at=now() WHERE id=v_seat.id; END IF;
   ELSIF p_action='notify' THEN UPDATE waiting_room_seats SET notify_enabled=p_notify WHERE id=v_seat.id; END IF;
 END IF;
 PERFORM internal_waiting_room_reconcile();
 SELECT * INTO v_seat FROM waiting_room_seats WHERE id=v_seat.id;
 IF p_seat_id IS NOT NULL AND v_seat.id IS NULL AND p_action<>'leave' THEN v_error:='expired'; END IF;
 SELECT EXISTS(SELECT 1 FROM push_tokens WHERE session_id=p_session_id AND device_id=p_device_id AND enabled) INTO v_registered;
 RETURN jsonb_build_object('error',v_error,'server_now',now(),'countdown_at',(SELECT countdown_at FROM waiting_room_state WHERE id=1),'push_registered',v_registered,'mine',CASE WHEN v_seat.id IS NULL THEN NULL ELSE to_jsonb(v_seat) END,
 'expiry_notice',(SELECT jsonb_build_object('id',id,'player_names',player_names) FROM waiting_room_expiry_notices WHERE session_id=p_session_id),
 'players',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'session_id',session_id,'player_name',player_name,'seat',seat,'ready',ready,'present',present,'expires_at',expires_at,'recall_until',recall_until) ORDER BY seat) FROM waiting_room_seats WHERE game_id IS NULL),'[]'::jsonb));
END $function$;
CREATE OR REPLACE FUNCTION public.waiting_room_count(p_session_id text)
 RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
 SELECT count(*)::integer FROM waiting_room_seats WHERE game_id IS NULL AND session_id<>p_session_id AND (present OR ready OR recall_until IS NULL OR recall_until>now());
$function$;
CREATE OR REPLACE FUNCTION public.ack_waiting_room_expiry(p_session_id text,p_device_id text,p_notice_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
 IF NOT claim_session(p_session_id,p_device_id) THEN RAISE EXCEPTION 'room_identity_denied'; END IF;
 DELETE FROM waiting_room_expiry_notices WHERE session_id=p_session_id AND id=p_notice_id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.ack_waiting_room_expiry(text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ack_waiting_room_expiry(text,text,uuid) TO anon,authenticated,service_role;