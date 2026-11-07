CREATE TABLE public.multiplayer_request_timings (
 request_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 attempt_id uuid NOT NULL,
 session_id text NOT NULL REFERENCES public.session_owners(session_id) ON DELETE CASCADE,
 operation text NOT NULL CHECK (operation IN ('roll','lock')),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 server_ms numeric NOT NULL CHECK (server_ms >= 0),
 success boolean NOT NULL
);
GRANT ALL ON public.multiplayer_request_timings TO service_role;
REVOKE ALL ON public.multiplayer_request_timings FROM anon, authenticated;
ALTER TABLE public.multiplayer_request_timings ENABLE ROW LEVEL SECURITY;
CREATE INDEX multiplayer_request_timings_attempt ON public.multiplayer_request_timings(attempt_id);
CREATE INDEX multiplayer_request_timings_owner ON public.multiplayer_request_timings(session_id);
CREATE INDEX multiplayer_request_timings_time ON public.multiplayer_request_timings(recorded_at);
COMMENT ON TABLE public.multiplayer_request_timings IS 'Restricted server receipts, independent of games cleanup. No dice, names, game IDs or network details. Owner deletion cascades; daily purge after 30 days. Transaction aborts cannot leave a receipt.';
CREATE FUNCTION public.internal_record_request_timing(p_attempt_id uuid,p_session_id text,p_device_id text,p_operation text,p_result jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
 IF p_attempt_id IS NOT NULL AND NOT coalesce((p_result->>'auth_failed')::boolean,false) AND EXISTS(SELECT 1 FROM public.session_owners WHERE session_id=p_session_id AND device_id=p_device_id) THEN
  BEGIN
   INSERT INTO public.multiplayer_request_timings(attempt_id,session_id,operation,server_ms,success) VALUES(p_attempt_id,p_session_id,p_operation,greatest(0,coalesce((p_result->>'server_ms')::numeric,0)),coalesce((p_result->>'success')::boolean,false));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.internal_record_request_timing(uuid,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.internal_record_request_timing(uuid,text,text,text,jsonb) TO service_role;
CREATE FUNCTION public.client_roll_diagnosed(p_game_id uuid,p_session_id text,p_device_id text,p_locked boolean[],p_attempt_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE result jsonb;
BEGIN
 result:=public.client_roll(p_game_id,p_session_id,p_device_id,p_locked);
 PERFORM public.internal_record_request_timing(p_attempt_id,p_session_id,p_device_id,'roll',result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.client_roll_diagnosed(uuid,text,text,boolean[],uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_roll_diagnosed(uuid,text,text,boolean[],uuid) TO anon,authenticated,service_role;
CREATE FUNCTION public.client_set_locks_diagnosed(p_game_id uuid,p_session_id text,p_device_id text,p_locked boolean[],p_expected_round integer,p_expected_rolls_left integer,p_expected_player_index integer,p_attempt_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE result jsonb;
BEGIN
 result:=public.client_set_locks_guarded(p_game_id,p_session_id,p_device_id,p_locked,p_expected_round,p_expected_rolls_left,p_expected_player_index);
 PERFORM public.internal_record_request_timing(p_attempt_id,p_session_id,p_device_id,'lock',result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.client_set_locks_diagnosed(uuid,text,text,boolean[],integer,integer,integer,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_set_locks_diagnosed(uuid,text,text,boolean[],integer,integer,integer,uuid) TO anon,authenticated,service_role;
SELECT cron.schedule('purge-multiplayer-request-timings','23 3 * * *', $purge$DELETE FROM public.multiplayer_request_timings WHERE recorded_at < now() - interval '30 days'$purge$);