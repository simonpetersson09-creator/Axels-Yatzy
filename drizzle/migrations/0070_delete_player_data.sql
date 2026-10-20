CREATE OR REPLACE FUNCTION public.delete_player_data(p_session_id text, p_device_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_sessions text[]; v_session text; v_player record;
BEGIN
  -- Destructive actions require an existing binding, never a first-claim.
  PERFORM 1 FROM public.session_owners WHERE session_id = p_session_id AND device_id = p_device_id FOR UPDATE;
  IF NOT FOUND OR p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'auth');
  END IF;
  SELECT array_agg(session_id) INTO v_sessions FROM public.session_owners WHERE device_id = p_device_id;
  -- Lock shared games first; leave all other seats and their scores untouched.
  PERFORM g.id FROM public.games g WHERE EXISTS (SELECT 1 FROM public.game_players gp WHERE gp.game_id = g.id AND gp.session_id = ANY(v_sessions)) ORDER BY g.id FOR UPDATE;
  DELETE FROM public.dice_roll_log l USING public.game_players gp WHERE l.game_id = gp.game_id AND l.player_index = gp.player_index AND gp.session_id = ANY(v_sessions);
  -- End active participation before redaction; existing rules handle quick-match bots.
  FOR v_player IN SELECT gp.game_id, gp.session_id FROM public.game_players gp JOIN public.games g ON g.id = gp.game_id WHERE gp.session_id = ANY(v_sessions) AND g.status = 'playing' LOOP
    PERFORM public.perform_forfeit(v_player.game_id, v_player.session_id);
  END LOOP;
  UPDATE public.games SET status = 'finished', forfeited_by = 'Deleted player', forfeited_by_session_id = NULL WHERE status = 'waiting' AND EXISTS (SELECT 1 FROM public.game_players gp WHERE gp.game_id = games.id AND gp.session_id = ANY(v_sessions));
  UPDATE public.games SET forfeited_by = 'Deleted player', forfeited_by_session_id = NULL WHERE forfeited_by_session_id = ANY(v_sessions);
  UPDATE public.game_players SET session_id = 'deleted:' || gen_random_uuid()::text, player_name = 'Deleted player', away = true WHERE session_id = ANY(v_sessions);
  -- Preserve anonymous match outcomes so opponents do not lose their statistics.
  UPDATE public.friend_match_results SET
    player_1_name = CASE WHEN player_1_id = ANY(v_sessions) THEN 'Deleted player' ELSE player_1_name END,
    player_2_name = CASE WHEN player_2_id = ANY(v_sessions) THEN 'Deleted player' ELSE player_2_name END,
    player_1_id = CASE WHEN player_1_id = ANY(v_sessions) THEN 'deleted:' || gen_random_uuid()::text ELSE player_1_id END,
    player_2_id = CASE WHEN player_2_id = ANY(v_sessions) THEN 'deleted:' || gen_random_uuid()::text ELSE player_2_id END,
    winner_id = CASE WHEN winner_id = ANY(v_sessions) THEN NULL ELSE winner_id END
  WHERE player_1_id = ANY(v_sessions) OR player_2_id = ANY(v_sessions) OR winner_id = ANY(v_sessions);
  DELETE FROM public.friend_requests WHERE from_session_id = ANY(v_sessions) OR to_session_id = ANY(v_sessions);
  DELETE FROM public.game_invites WHERE from_session_id = ANY(v_sessions) OR to_session_id = ANY(v_sessions);
  DELETE FROM public.lobby_join_queue WHERE session_id = ANY(v_sessions);
  DELETE FROM public.matchmaking_queue WHERE session_id = ANY(v_sessions);
  DELETE FROM public.turn_push_queue WHERE sender_session_id = ANY(v_sessions);
  DELETE FROM public.notification_log WHERE recipient_session_id = ANY(v_sessions) OR recipient_device_id = p_device_id;
  DELETE FROM public.weekly_reminder_log WHERE session_id = ANY(v_sessions) OR device_id = p_device_id;
  DELETE FROM public.push_tokens WHERE session_id = ANY(v_sessions) OR device_id = p_device_id;
  DELETE FROM public.notification_preferences WHERE device_id = p_device_id;
  DELETE FROM public.analytics_events WHERE device_id = p_device_id OR local_user_id = p_device_id OR session_id = ANY(v_sessions) OR session_id IN (SELECT id FROM public.analytics_sessions WHERE device_id = p_device_id);
  DELETE FROM public.analytics_sessions WHERE device_id = p_device_id;
  DELETE FROM public.referral_clicks WHERE inviter_session_id = ANY(v_sessions);
  DELETE FROM public.referral_credits WHERE invitee_session_id = ANY(v_sessions) OR inviter_session_id = ANY(v_sessions);
  DELETE FROM public.referral_codes WHERE session_id = ANY(v_sessions);
  DELETE FROM public.referral_rewards WHERE session_id = ANY(v_sessions);
  DELETE FROM public.player_avatars WHERE session_id = ANY(v_sessions);
  DELETE FROM public.player_country_stats WHERE session_id = ANY(v_sessions);
  DELETE FROM public.player_games_history WHERE session_id = ANY(v_sessions);
  DELETE FROM public.weekly_hall_of_fame WHERE session_id = ANY(v_sessions);
  DELETE FROM public.player_designs WHERE session_id = ANY(v_sessions);
  DELETE FROM public.player_xp WHERE session_id = ANY(v_sessions);
  DELETE FROM public.dice_progress WHERE session_id = ANY(v_sessions);
  DELETE FROM public.dice_preferences WHERE session_id = ANY(v_sessions);
  DELETE FROM public.yatzy_match_log WHERE session_id = ANY(v_sessions);
  -- Exact delimiter-bound IDs only, not partial matches with another player.
  DELETE FROM public.rate_limits WHERE key = p_device_id OR key = ANY(v_sessions) OR p_device_id = ANY(string_to_array(key, ':')) OR EXISTS (SELECT 1 FROM unnest(v_sessions) s WHERE s = ANY(string_to_array(key, ':')));
  DELETE FROM public.world_leaders_cache WHERE id = 1;
  DELETE FROM public.session_owners WHERE device_id = p_device_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.delete_player_data(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_player_data(text,text) TO anon, authenticated, service_role;