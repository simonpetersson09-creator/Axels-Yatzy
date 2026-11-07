INSERT INTO public.admin_match_archive_players(game_id, session_id)
SELECT DISTINCT ON (a.game_id, e.device_id) a.game_id, so.session_id
FROM public.admin_match_archive a
JOIN public.analytics_events e ON e.game_id=a.game_id::text AND e.event_name='game_forfeited' AND e.game_mode='multiplayer'
JOIN public.session_owners so ON so.device_id=e.device_id
WHERE a.source='client_forfeit_partial'
  AND NOT EXISTS (SELECT 1 FROM public.admin_match_archive_players p WHERE p.game_id=a.game_id)
ORDER BY a.game_id, e.device_id, so.created_at DESC
ON CONFLICT DO NOTHING;