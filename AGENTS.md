# Architecture rules

- Online quick-match uses `matchmaking_queue` (service-role only) accessed via SECURITY DEFINER RPCs `find_or_join_match`/`leave_matchmaking`; matched games are normal 2-player `games` rows opened in `MultiplayerGamePage`. Why: reuses all server-authoritative multiplayer logic, and no client can read the queue directly.
