CREATE TABLE public.player_avatars (
  session_id text PRIMARY KEY,
  image text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.player_avatars TO service_role;
ALTER TABLE public.player_avatars ENABLE ROW LEVEL SECURITY;
CREATE POLICY "no direct access to avatars" ON public.player_avatars FOR SELECT USING (false);

CREATE OR REPLACE FUNCTION public.set_player_avatar(p_session_id text, p_device_id text, p_image text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_session_id IS NULL OR p_device_id IS NULL THEN RETURN false; END IF;
  IF NOT public.claim_session(p_session_id, p_device_id) THEN RETURN false; END IF;
  IF p_image IS NULL OR p_image = '' THEN
    DELETE FROM public.player_avatars WHERE session_id = p_session_id;
    RETURN true;
  END IF;
  IF length(p_image) > 200000 OR p_image !~ '^data:image/(jpeg|png);base64,[A-Za-z0-9+/=]+$' THEN
    RETURN false;
  END IF;
  INSERT INTO public.player_avatars(session_id, image, updated_at) VALUES (p_session_id, p_image, now())
  ON CONFLICT (session_id) DO UPDATE SET image = EXCLUDED.image, updated_at = now();
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.get_game_avatars(p_game_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('player_index', gp.player_index, 'image', a.image)), '[]'::jsonb)
  FROM public.game_players gp JOIN public.player_avatars a ON a.session_id = gp.session_id
  WHERE gp.game_id = p_game_id AND NOT gp.is_bot;
$$;
GRANT EXECUTE ON FUNCTION public.set_player_avatar(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_game_avatars(uuid) TO anon, authenticated;