CREATE OR REPLACE FUNCTION public.get_frames_for_sessions(p_session_ids text[])
RETURNS TABLE(session_id text, frame text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT x.session_id, x.selected_frame FROM public.player_xp x
  WHERE x.session_id = ANY(p_session_ids[1:50]) AND x.selected_frame IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.player_designs d WHERE d.session_id = x.session_id AND d.design_id = x.selected_frame);
$$;
GRANT EXECUTE ON FUNCTION public.get_frames_for_sessions(text[]) TO anon, authenticated;