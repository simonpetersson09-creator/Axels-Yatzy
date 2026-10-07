REVOKE EXECUTE ON FUNCTION public.perform_roll_dice(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.perform_roll_dice(uuid, text, integer[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.perform_roll_dice(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.perform_roll_dice(uuid, text, integer[]) TO service_role;