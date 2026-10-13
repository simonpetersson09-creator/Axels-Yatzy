DROP TRIGGER IF EXISTS trg_warm_on_turn_change ON public.games;
DROP TRIGGER IF EXISTS trg_warm_on_game_insert ON public.games;
COMMENT ON FUNCTION public.internal_warm_ping(integer) IS 'DEPRECATED: keep-warm removed — the 20 s cron caused database worker stalls.';
COMMENT ON FUNCTION public.internal_warm_game_functions() IS 'DEPRECATED: keep-warm removed.';