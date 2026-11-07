WITH f AS (
  SELECT e.game_id::uuid gid, min(e.created_at) at
  FROM public.analytics_events e
  WHERE e.event_name='game_forfeited' AND e.game_mode='multiplayer'
    AND e.platform IN ('ios','android') AND e.game_id ~ '^[0-9a-f-]{36}$'
    AND NOT EXISTS (SELECT 1 FROM public.games g WHERE g.id::text=e.game_id)
  GROUP BY 1
)
INSERT INTO public.admin_match_archive(game_id, activity_at, status, forfeited_by, forfeited_by_session_id, source)
SELECT gid, at, 'finished', 'marked', 'marked', 'client_forfeit_partial' FROM f
ON CONFLICT (game_id) DO UPDATE SET status='finished', forfeited_by='marked', forfeited_by_session_id='marked',
  source = CASE WHEN admin_match_archive.source='server' THEN admin_match_archive.source ELSE 'client_forfeit_partial' END
WHERE admin_match_archive.forfeited_by_session_id IS NULL AND admin_match_archive.source <> 'server';

INSERT INTO public.admin_match_archive_players(game_id, session_id)
SELECT DISTINCT e.game_id::uuid, e.session_id
FROM public.analytics_events e
JOIN public.admin_match_archive a ON a.game_id::text=e.game_id AND a.source='client_forfeit_partial'
JOIN public.session_owners so ON so.session_id=e.session_id
WHERE e.event_name IN ('game_forfeited','game_finished','game_started','quick_match_online_matched') AND e.game_mode='multiplayer'
ON CONFLICT DO NOTHING;