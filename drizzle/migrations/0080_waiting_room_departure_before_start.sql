CREATE OR REPLACE FUNCTION public.waiting_room_action(p_session_id text,p_device_id text,p_action text DEFAULT 'sync',p_seat_id uuid DEFAULT NULL,p_name text DEFAULT NULL,p_ready boolean DEFAULT false,p_notify boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_seat waiting_room_seats%ROWTYPE; v_slot integer; v_error text; v_start timestamptz; v_registered boolean;
BEGIN
 IF NOT claim_session(p_session_id,p_device_id) THEN RAISE EXCEPTION 'room_identity_denied'; END IF;
 PERFORM pg_advisory_xact_lock(742001);
 -- Departure cancels a pending start before reconciliation can finalize it.
 IF p_action IN ('away','leave') THEN
   UPDATE waiting_room_seats SET present=false,ready=false
   WHERE session_id=p_session_id AND game_id IS NULL AND (p_seat_id IS NULL OR id=p_seat_id);
 END IF;
 -- A late return cannot resurrect an expired recall.
 PERFORM internal_waiting_room_reconcile();
 IF p_seat_id IS NOT NULL THEN
   SELECT * INTO v_seat FROM waiting_room_seats WHERE id=p_seat_id AND session_id=p_session_id;
 ELSE
   SELECT * INTO v_seat FROM waiting_room_seats WHERE session_id=p_session_id AND game_id IS NULL;
 END IF;
 SELECT countdown_at INTO v_start FROM waiting_room_state WHERE id=1;
 IF p_action='join' THEN
   IF v_seat.id IS NULL THEN
     IF v_start IS NOT NULL THEN v_error:='starting';
     ELSE
       SELECT i INTO v_slot FROM generate_series(0,3) i WHERE NOT EXISTS
       (SELECT 1 FROM waiting_room_seats WHERE game_id IS NULL AND seat=i) ORDER BY i LIMIT 1;
       IF v_slot IS NULL THEN v_error:='full';
       ELSE
         INSERT INTO waiting_room_seats(session_id,player_name,seat)
         VALUES(p_session_id,left(coalesce(nullif(trim(p_name),''),'Spelare'),20),v_slot) RETURNING * INTO v_seat;
       END IF;
     END IF;
   END IF;
 ELSIF p_action NOT IN ('sync','heartbeat','ready','away','leave','extend','notify','open') THEN
   RAISE EXCEPTION 'room_invalid_action';
 END IF;
 IF p_seat_id IS NOT NULL AND v_seat.id IS NULL THEN v_error:='expired'; END IF;
 IF v_seat.id IS NOT NULL AND v_seat.game_id IS NULL THEN
   IF p_action='leave' THEN
     DELETE FROM waiting_room_seats WHERE id=v_seat.id;
     UPDATE waiting_room_state SET countdown_at=NULL,revision=revision+1 WHERE id=1;
     UPDATE waiting_room_seats SET ready=false WHERE game_id IS NULL;
     v_seat.id:=NULL;
   ELSIF p_action='away' THEN
     UPDATE waiting_room_seats SET present=false,ready=false WHERE id=v_seat.id;
   ELSIF p_action IN ('heartbeat','open','join') THEN
     UPDATE waiting_room_seats SET present=true,last_seen_at=now(),recall_until=NULL,recall_id=NULL
     WHERE id=v_seat.id;
   ELSIF p_action='extend' THEN
     UPDATE waiting_room_seats SET expires_at=now()+interval '15 minutes' WHERE id=v_seat.id;
   ELSIF p_action='ready' THEN
     IF v_start IS NOT NULL THEN v_error:='starting';
     ELSIF NOT v_seat.present THEN v_error:='away';
     ELSE UPDATE waiting_room_seats SET ready=p_ready,last_seen_at=now() WHERE id=v_seat.id;
     END IF;
   ELSIF p_action='notify' THEN
     UPDATE waiting_room_seats SET notify_enabled=p_notify WHERE id=v_seat.id;
   END IF;
 END IF;
 PERFORM internal_waiting_room_reconcile();
 SELECT * INTO v_seat FROM waiting_room_seats WHERE id=v_seat.id;
 SELECT EXISTS(SELECT 1 FROM push_tokens WHERE session_id=p_session_id AND device_id=p_device_id AND enabled) INTO v_registered;
 RETURN jsonb_build_object('error',v_error,'server_now',now(),'countdown_at',(SELECT countdown_at FROM waiting_room_state WHERE id=1),
 'push_registered',v_registered,'mine',CASE WHEN v_seat.id IS NULL THEN NULL ELSE to_jsonb(v_seat) END,
 'players',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'session_id',session_id,'player_name',player_name,'seat',seat,'ready',ready,'present',present,'expires_at',expires_at,'recall_until',recall_until) ORDER BY seat)
 FROM waiting_room_seats WHERE game_id IS NULL),'[]'::jsonb));
END $$;