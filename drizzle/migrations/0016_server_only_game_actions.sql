-- Game actions only via edge functions (which verify the owning device).
REVOKE EXECUTE ON FUNCTION public.perform_forfeit(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.perform_start_game(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.perform_submit_score(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.perform_toggle_lock(uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.internal_record_friend_match(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.perform_forfeit(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.perform_start_game(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.perform_submit_score(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.perform_toggle_lock(uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.internal_record_friend_match(uuid) TO service_role;