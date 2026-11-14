ALTER TABLE public.analytics_events ADD COLUMN delivery_event_id text;
CREATE UNIQUE INDEX analytics_events_delivery_receipt ON public.analytics_events(device_id,event_name,delivery_event_id);
CREATE OR REPLACE FUNCTION public.log_analytics_events(p_device_id text,p_events jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_count int;
BEGIN
 IF p_device_id IS NULL OR p_events IS NULL OR jsonb_typeof(p_events)<>'array' THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.session_owners WHERE device_id=p_device_id) THEN RETURN; END IF;
 v_count:=jsonb_array_length(p_events); IF v_count=0 OR v_count>50 THEN RETURN; END IF;
 INSERT INTO public.analytics_events(event_name,session_id,device_id,local_user_id,auth_user_id,game_id,game_mode,metadata,platform,app_version,delivery_event_id)
 SELECT left(coalesce(e->>'event_name','unknown'),64),left(e->>'session_id',64),p_device_id,p_device_id,(SELECT auth.uid()::text),left(e->>'game_id',64),left(e->>'game_mode',32),CASE WHEN jsonb_typeof(e->'metadata')='object' THEN e->'metadata' ELSE NULL END,left(e->>'platform',32),left(e->>'app_version',32),left(nullif(e->'metadata'->>'event_id',''),128)
 FROM jsonb_array_elements(p_events) AS e ON CONFLICT(device_id,event_name,delivery_event_id) DO NOTHING;
END $function$;
REVOKE ALL ON FUNCTION public.log_analytics_events(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_analytics_events(text,jsonb) TO anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.client_submit_score_diagnosed(p_game_id uuid,p_session_id text,p_device_id text,p_category_id text,p_expected_dice integer[],p_attempt_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE result jsonb; started timestamptz:=clock_timestamp();
BEGIN
 result:=public.client_submit_score(p_game_id,p_session_id,p_device_id,p_category_id,p_expected_dice);
 result:=result || jsonb_build_object('server_ms',greatest(0,extract(epoch FROM clock_timestamp()-started)*1000));
 PERFORM public.internal_record_request_timing(p_attempt_id,p_session_id,p_device_id,'score',result);
 RETURN result;
END $function$;
REVOKE ALL ON FUNCTION public.client_submit_score_diagnosed(uuid,text,text,text,integer[],uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_submit_score_diagnosed(uuid,text,text,text,integer[],uuid) TO anon,authenticated,service_role;