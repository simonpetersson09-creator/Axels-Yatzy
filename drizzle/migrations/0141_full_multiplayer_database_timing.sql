ALTER TABLE public.multiplayer_request_timings ADD COLUMN db_statement_ms numeric, ADD COLUMN db_entry_ms numeric, ADD COLUMN db_action_ms numeric;
COMMENT ON COLUMN public.multiplayer_request_timings.db_statement_ms IS 'SQL statement start to action end, includes lock waits; excludes gateway/pool before SQL and receipt insertion/response encoding.';
COMMENT ON COLUMN public.multiplayer_request_timings.db_entry_ms IS 'SQL statement start to diagnosed wrapper entry, not gateway/network time.';
COMMENT ON COLUMN public.multiplayer_request_timings.db_action_ms IS 'Diagnosed wrapper entry to action end including row locks and device checks.';
CREATE OR REPLACE FUNCTION public.internal_database_timing(p_result jsonb,p_entered timestamptz) RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public' AS $function$
DECLARE finished timestamptz:=clock_timestamp();
BEGIN
 RETURN p_result || jsonb_build_object('db_statement_ms',greatest(0,extract(epoch FROM finished-statement_timestamp())*1000),'db_entry_ms',greatest(0,extract(epoch FROM p_entered-statement_timestamp())*1000),'db_action_ms',greatest(0,extract(epoch FROM finished-p_entered)*1000));
END $function$;
REVOKE ALL ON FUNCTION public.internal_database_timing(jsonb,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.internal_database_timing(jsonb,timestamptz) TO service_role;
CREATE OR REPLACE FUNCTION public.internal_record_request_timing(p_attempt_id uuid,p_session_id text,p_device_id text,p_operation text,p_result jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
 IF p_attempt_id IS NOT NULL AND NOT coalesce((p_result->>'auth_failed')::boolean,false) AND EXISTS(SELECT 1 FROM public.session_owners WHERE session_id=p_session_id AND device_id=p_device_id) THEN
  BEGIN
   INSERT INTO public.multiplayer_request_timings(attempt_id,session_id,operation,server_ms,success,db_statement_ms,db_entry_ms,db_action_ms) VALUES(p_attempt_id,p_session_id,p_operation,greatest(0,coalesce((p_result->>'server_ms')::numeric,0)),coalesce((p_result->>'success')::boolean,false),(p_result->>'db_statement_ms')::numeric,(p_result->>'db_entry_ms')::numeric,(p_result->>'db_action_ms')::numeric);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
 END IF;
END $function$;
REVOKE ALL ON FUNCTION public.internal_record_request_timing(uuid,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.internal_record_request_timing(uuid,text,text,text,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.client_roll_diagnosed(p_game_id uuid,p_session_id text,p_device_id text,p_locked boolean[],p_attempt_id uuid,p_expected_rolls_left integer DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE result jsonb; v_game record; entered timestamptz:=clock_timestamp();
BEGIN
 IF p_expected_rolls_left IS NOT NULL THEN
  SELECT rolls_left,dice,round,current_player_index INTO v_game FROM games WHERE id=p_game_id FOR UPDATE;
  IF FOUND AND v_game.rolls_left IS DISTINCT FROM p_expected_rolls_left THEN
   result:=jsonb_build_object('success',false,'stale_command',true,'stale_roll',true,'error','roll already applied','dice',to_jsonb(v_game.dice),'rolls_left',v_game.rolls_left,'round',v_game.round,'current_player_index',v_game.current_player_index);
   result:=public.internal_database_timing(result,entered);
   PERFORM public.internal_record_request_timing(p_attempt_id,p_session_id,p_device_id,'roll',result);
   RETURN result;
  END IF;
 END IF;
 result:=public.client_roll(p_game_id,p_session_id,p_device_id,p_locked);
 result:=public.internal_database_timing(result,entered);
 PERFORM public.internal_record_request_timing(p_attempt_id,p_session_id,p_device_id,'roll',result);
 RETURN result;
END $function$;
REVOKE ALL ON FUNCTION public.client_roll_diagnosed(uuid,text,text,boolean[],uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_roll_diagnosed(uuid,text,text,boolean[],uuid,integer) TO anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.client_set_locks_diagnosed(p_game_id uuid,p_session_id text,p_device_id text,p_locked boolean[],p_expected_round integer,p_expected_rolls_left integer,p_expected_player_index integer,p_attempt_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE result jsonb; entered timestamptz:=clock_timestamp();
BEGIN
 result:=public.client_set_locks_guarded(p_game_id,p_session_id,p_device_id,p_locked,p_expected_round,p_expected_rolls_left,p_expected_player_index);
 result:=public.internal_database_timing(result,entered);
 PERFORM public.internal_record_request_timing(p_attempt_id,p_session_id,p_device_id,'lock',result);
 RETURN result;
END $function$;
REVOKE ALL ON FUNCTION public.client_set_locks_diagnosed(uuid,text,text,boolean[],integer,integer,integer,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_set_locks_diagnosed(uuid,text,text,boolean[],integer,integer,integer,uuid) TO anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.client_submit_score_diagnosed(p_game_id uuid,p_session_id text,p_device_id text,p_category_id text,p_expected_dice integer[],p_attempt_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE result jsonb; entered timestamptz:=clock_timestamp();
BEGIN
 result:=public.client_submit_score(p_game_id,p_session_id,p_device_id,p_category_id,p_expected_dice);
 result:=result || jsonb_build_object('server_ms',greatest(0,extract(epoch FROM clock_timestamp()-entered)*1000));
 result:=public.internal_database_timing(result,entered);
 PERFORM public.internal_record_request_timing(p_attempt_id,p_session_id,p_device_id,'score',result);
 RETURN result;
END $function$;
REVOKE ALL ON FUNCTION public.client_submit_score_diagnosed(uuid,text,text,text,integer[],uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_submit_score_diagnosed(uuid,text,text,text,integer[],uuid) TO anon,authenticated,service_role;