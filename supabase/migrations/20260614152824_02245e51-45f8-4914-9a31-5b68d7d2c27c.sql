-- Remove any accidental duplicates first (keep oldest)
DELETE FROM public.friend_match_results a
USING public.friend_match_results b
WHERE a.ctid < b.ctid AND a.game_id = b.game_id;

ALTER TABLE public.friend_match_results
  ADD CONSTRAINT friend_match_results_game_id_key UNIQUE (game_id);