CREATE TABLE public.player_names (
  session_id text PRIMARY KEY,
  name text NOT NULL,
  name_key text NOT NULL UNIQUE,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.player_names TO service_role;
ALTER TABLE public.player_names ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.reserve_player_name(p_session_id text, p_device_id text, p_name text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_name text := btrim(regexp_replace(coalesce(p_name,''), '\s+', ' ', 'g')); v_key text; v_owner text;
BEGIN
  IF NOT public.claim_session(p_session_id, p_device_id) THEN RETURN 'auth'; END IF;
  IF v_name = '' THEN
    DELETE FROM public.player_names WHERE session_id = p_session_id;
    RETURN 'ok';
  END IF;
  IF length(v_name) > 20 THEN RETURN 'invalid'; END IF;
  v_key := lower(v_name);
  SELECT session_id INTO v_owner FROM public.player_names WHERE name_key = v_key FOR UPDATE;
  IF v_owner IS NOT NULL AND v_owner <> p_session_id THEN RETURN 'taken'; END IF;
  INSERT INTO public.player_names(session_id, name, name_key, updated_at)
  VALUES (p_session_id, v_name, v_key, now())
  ON CONFLICT (session_id) DO UPDATE SET name = EXCLUDED.name, name_key = EXCLUDED.name_key, updated_at = now();
  RETURN 'ok';
EXCEPTION WHEN unique_violation THEN RETURN 'taken';
END $$;
REVOKE ALL ON FUNCTION public.reserve_player_name(text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.reserve_player_name(text,text,text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.free_player_name_on_owner_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN DELETE FROM public.player_names WHERE session_id = OLD.session_id; RETURN OLD; END $$;
CREATE TRIGGER free_player_name_on_owner_delete AFTER DELETE ON public.session_owners
FOR EACH ROW EXECUTE FUNCTION public.free_player_name_on_owner_delete();