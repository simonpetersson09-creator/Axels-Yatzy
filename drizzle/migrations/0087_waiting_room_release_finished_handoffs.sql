CREATE OR REPLACE FUNCTION public.internal_waiting_room_reconcile() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_changed boolean := false; v_count integer; v_all boolean; v_start timestamptz; v_game uuid; v_code text; v_attempt integer := 0;
BEGIN
 PERFORM pg_advisory_xact_lock(742001);
 INSERT INTO waiting_room_state(id) VALUES(1) ON CONFLICT DO NOTHING;
 UPDATE waiting_room_seats SET present=false,ready=false WHERE game_id IS NULL AND present AND last_seen_at<=now()-interval '25 seconds';
 v_changed:=FOUND;
 SELECT count(*) INTO v_count FROM waiting_room_seats WHERE game_id IS NULL;
 IF v_count>1 THEN
   DELETE FROM waiting_room_seats WHERE game_id IS NULL AND NOT ready AND recall_until<=now();
   v_changed:=v_changed OR FOUND;
 END IF;
 -- A finished match must never capture a later waiting-room entry.
 -- Remove only the handoff rows, not the game, scores, or waiting participants.
 DELETE FROM waiting_room_seats s WHERE s.game_id IS NOT NULL AND
   (s.matched_at<now()-interval '24 hours' OR EXISTS
     (SELECT 1 FROM games g WHERE g.id=s.game_id AND g.status='finished'));
 SELECT count(*) INTO v_count FROM waiting_room_seats WHERE game_id IS NULL;
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
   UPDATE waiting_room_seats SET recall_until=NULL,recall_id=NULL WHERE game_id IS NULL AND ready AND (recall_until IS NOT NULL OR recall_id IS NOT NULL);
   UPDATE waiting_room_seats SET recall_until=now()+interval '120 seconds' WHERE game_id IS NULL AND NOT ready AND recall_until IS NULL;
   UPDATE waiting_room_seats SET recall_id=gen_random_uuid() WHERE game_id IS NULL AND NOT present AND NOT ready AND recall_id IS NULL;
   INSERT INTO waiting_room_push_queue(id,seat_id,expires_at)
   SELECT recall_id,id,recall_until FROM waiting_room_seats WHERE game_id IS NULL AND NOT present AND NOT ready AND notify_enabled AND recall_id IS NOT NULL ON CONFLICT DO NOTHING;
 END IF;
 DELETE FROM waiting_room_push_queue q WHERE q.expires_at<=now() OR NOT EXISTS
 (SELECT 1 FROM waiting_room_seats s WHERE s.id=q.seat_id AND s.game_id IS NULL AND NOT s.present AND NOT s.ready AND s.notify_enabled AND s.recall_id=q.id AND s.recall_until>now());
END $$;