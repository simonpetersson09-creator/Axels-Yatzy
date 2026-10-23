CREATE OR REPLACE FUNCTION public.internal_waiting_room_take_push()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_q waiting_room_push_queue%ROWTYPE; v_s waiting_room_seats%ROWTYPE; v_device text; v_claimed text;
BEGIN
 PERFORM pg_advisory_xact_lock(742001);
 PERFORM internal_waiting_room_reconcile();
 FOR v_q IN
   SELECT q.* FROM waiting_room_push_queue q JOIN waiting_room_seats s ON s.id=q.seat_id
   WHERE q.dispatched_at IS NULL AND q.expires_at>now() AND s.game_id IS NULL
     AND NOT s.present AND NOT s.ready AND s.notify_enabled AND s.recall_id=q.id AND s.recall_until>now()
   ORDER BY q.expires_at,q.id FOR UPDATE OF q
 LOOP
   -- Consume suppressed jobs too: never deliver an old recall after the cooldown.
   UPDATE waiting_room_push_queue SET dispatched_at=now() WHERE id=v_q.id;
   SELECT * INTO v_s FROM waiting_room_seats WHERE id=v_q.seat_id;
   SELECT o.device_id INTO v_device FROM session_owners o WHERE o.session_id=v_s.session_id
     AND EXISTS (SELECT 1 FROM push_tokens t WHERE t.session_id=v_s.session_id AND t.device_id=o.device_id AND t.enabled);
   IF v_device IS NULL THEN CONTINUE; END IF;
   v_claimed:=NULL;
   -- Atomic, device-bound and independent of seat/session replacement.
   INSERT INTO rate_limits(key,last_request_at) VALUES('waiting_room_push:'||v_device,now())
   ON CONFLICT(key) DO UPDATE SET last_request_at=EXCLUDED.last_request_at
     WHERE rate_limits.last_request_at<=now()-interval '15 minutes'
   RETURNING key INTO v_claimed;
   IF v_claimed IS NULL THEN CONTINUE; END IF;
   RETURN jsonb_build_object('id',v_q.id,'seat_id',v_s.id,'session_id',v_s.session_id,'device_id',v_device,'expires_at',v_q.expires_at);
 END LOOP;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.internal_waiting_room_take_push() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.internal_waiting_room_take_push() TO service_role;