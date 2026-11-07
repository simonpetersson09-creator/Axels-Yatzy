DO $migration$
DECLARE definition text; old_block text; new_block text;
BEGIN
 definition := pg_get_functiondef('public.admin_daily_stats_v3(date)'::regprocedure);
 old_block := $old$latest_releases as (
 select release from (
  select distinct public.admin_issue_release(app_version) release from (
   select distinct app_version from analytics_sessions where platform in ('ios','android')
   union select distinct app_version from analytics_events where platform in ('ios','android')
  ) raw_versions
 ) versions where release is not null order by release desc limit 2
),$old$;
 new_block := $new$raw_versions AS MATERIALIZED (
 SELECT DISTINCT app_version FROM analytics_sessions WHERE platform IN ('ios','android')
 UNION SELECT DISTINCT app_version FROM analytics_events WHERE platform IN ('ios','android')
), latest_releases AS MATERIALIZED (
 SELECT release FROM (SELECT DISTINCT public.admin_issue_release(app_version) release FROM raw_versions) versions
 WHERE release IS NOT NULL ORDER BY release DESC LIMIT 2
),$new$;
 IF position(old_block in definition)=0 THEN RAISE EXCEPTION 'Expected admin release lookup not found'; END IF;
 EXECUTE replace(definition,old_block,new_block);
END $migration$;
REVOKE ALL ON FUNCTION public.admin_daily_stats_v3(date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_daily_stats_v3(date) TO service_role;
CREATE OR REPLACE FUNCTION public.client_set_locks_guarded(p_game_id uuid,p_session_id text,p_device_id text,p_locked boolean[],p_expected_round integer,p_expected_rolls_left integer,p_expected_player_index integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_game record; v_result jsonb; v_started timestamptz:=clock_timestamp();
BEGIN
 IF p_session_id IS NULL OR p_device_id IS NULL OR length(p_device_id) NOT BETWEEN 8 AND 64 THEN
  v_result:=jsonb_build_object('success',false,'auth_failed',true,'error','device_id required');
 ELSIF p_expected_round IS NULL OR p_expected_rolls_left IS NULL OR p_expected_player_index IS NULL THEN
  v_result:=jsonb_build_object('success',false,'error','expected turn required');
 ELSIF NOT public.claim_session(p_session_id,p_device_id) THEN
  v_result:=jsonb_build_object('success',false,'auth_failed',true,'error','Fel enhet för spelaren');
 ELSE
  SELECT * INTO v_game FROM games WHERE id=p_game_id FOR UPDATE;
  IF v_game IS NULL THEN
   v_result:=jsonb_build_object('success',false,'error','Spelet hittades inte');
  ELSIF v_game.round IS DISTINCT FROM p_expected_round OR v_game.rolls_left IS DISTINCT FROM p_expected_rolls_left OR v_game.current_player_index IS DISTINCT FROM p_expected_player_index THEN
   v_result:=jsonb_build_object('success',false,'stale_command',true,'error','stale lock command');
  ELSE
   v_result:=public.perform_set_locks(p_game_id,p_session_id,p_locked);
   IF coalesce((v_result->>'success')::boolean,false) THEN
    UPDATE game_players SET last_active_at=now(),away=false WHERE game_id=p_game_id AND session_id=p_session_id AND (away OR last_active_at<now()-interval '10 seconds');
   END IF;
  END IF;
 END IF;
 RETURN v_result || jsonb_build_object('server_ms',greatest(0,round(extract(epoch FROM (clock_timestamp()-v_started))*1000)));
END $function$;
REVOKE ALL ON FUNCTION public.client_set_locks_guarded(uuid,text,text,boolean[],integer,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_set_locks_guarded(uuid,text,text,boolean[],integer,integer,integer) TO anon,authenticated,service_role;