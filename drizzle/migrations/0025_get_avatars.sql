CREATE OR REPLACE FUNCTION public.get_avatars(p_session_ids text[])
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_object_agg(session_id, image), '{}'::jsonb)
  FROM public.player_avatars
  WHERE session_id = ANY((p_session_ids)[1:200]);
$$;
GRANT EXECUTE ON FUNCTION public.get_avatars(text[]) TO anon, authenticated;