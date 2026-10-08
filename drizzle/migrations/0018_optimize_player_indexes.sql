CREATE INDEX IF NOT EXISTS idx_game_players_session_cover ON public.game_players (session_id) INCLUDE (game_id, player_name);
DROP INDEX IF EXISTS public.idx_game_players_session_id;
ALTER TABLE public.game_players DROP CONSTRAINT IF EXISTS unique_game_player_index;
ALTER TABLE public.game_players DROP CONSTRAINT IF EXISTS unique_game_session;
DROP INDEX IF EXISTS public.idx_game_players_game_id;
DROP INDEX IF EXISTS public.idx_games_game_code;
ANALYZE public.game_players;
ANALYZE public.games;