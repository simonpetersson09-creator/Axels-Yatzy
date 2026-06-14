-- Status enum
DO $$ BEGIN
  CREATE TYPE public.invite_status AS ENUM ('pending','accepted','declined','cancelled','expired');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Table
CREATE TABLE IF NOT EXISTS public.game_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_session_id text NOT NULL,
  from_name text NOT NULL,
  to_session_id text NOT NULL,
  to_name text NOT NULL,
  status public.invite_status NOT NULL DEFAULT 'pending',
  game_id uuid REFERENCES public.games(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  responded_at timestamptz
);

CREATE INDEX IF NOT EXISTS game_invites_to_status_idx ON public.game_invites (to_session_id, status);
CREATE INDEX IF NOT EXISTS game_invites_from_status_idx ON public.game_invites (from_session_id, status);

GRANT SELECT ON public.game_invites TO anon, authenticated;
GRANT ALL ON public.game_invites TO service_role;

ALTER TABLE public.game_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read invites" ON public.game_invites;
CREATE POLICY "Anyone can read invites" ON public.game_invites
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Service role writes invites" ON public.game_invites;
CREATE POLICY "Service role writes invites" ON public.game_invites
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Add to realtime
ALTER TABLE public.game_invites REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.game_invites;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Accept invite RPC: creates game + both players atomically
CREATE OR REPLACE FUNCTION public.accept_invite(p_invite_id uuid, p_session_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite RECORD;
  v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code TEXT;
  v_game RECORD;
  v_attempt INTEGER := 0;
  v_active_from INTEGER;
  v_active_to INTEGER;
BEGIN
  SELECT * INTO v_invite FROM game_invites WHERE id = p_invite_id FOR UPDATE;
  IF v_invite IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Inbjudan finns inte');
  END IF;
  IF v_invite.to_session_id <> p_session_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Inbjudan är inte till dig');
  END IF;
  IF v_invite.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Inbjudan är inte längre aktiv');
  END IF;
  IF v_invite.expires_at < now() THEN
    UPDATE game_invites SET status = 'expired' WHERE id = p_invite_id;
    RETURN jsonb_build_object('success', false, 'error', 'Inbjudan har gått ut');
  END IF;

  -- Enforce max 3 active multiplayer games per side
  SELECT count(*) INTO v_active_from
  FROM games g JOIN game_players gp ON gp.game_id = g.id
  WHERE gp.session_id = v_invite.from_session_id AND g.status IN ('waiting','playing');
  SELECT count(*) INTO v_active_to
  FROM games g JOIN game_players gp ON gp.game_id = g.id
  WHERE gp.session_id = v_invite.to_session_id AND g.status IN ('waiting','playing');
  IF v_active_from >= 3 THEN
    RETURN jsonb_build_object('success', false, 'error', v_invite.from_name || ' har redan 3 aktiva spel');
  END IF;
  IF v_active_to >= 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Du har redan 3 aktiva spel');
  END IF;

  -- Create game with unique code
  LOOP
    v_attempt := v_attempt + 1;
    IF v_attempt > 10 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Kunde inte skapa spel');
    END IF;
    v_code := '';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
    END LOOP;
    BEGIN
      INSERT INTO games (game_code, status, max_players)
      VALUES (v_code, 'playing', 2)
      RETURNING * INTO v_game;
      EXIT;
    EXCEPTION WHEN unique_violation THEN CONTINUE; END;
  END LOOP;

  INSERT INTO game_players (game_id, player_name, player_index, session_id)
  VALUES
    (v_game.id, v_invite.from_name, 0, v_invite.from_session_id),
    (v_game.id, v_invite.to_name,   1, v_invite.to_session_id);

  UPDATE game_invites
  SET status = 'accepted', game_id = v_game.id, responded_at = now()
  WHERE id = p_invite_id;

  RETURN jsonb_build_object(
    'success', true,
    'game_id', v_game.id,
    'game_code', v_game.game_code
  );
END;
$$;

-- Decline invite RPC
CREATE OR REPLACE FUNCTION public.decline_invite(p_invite_id uuid, p_session_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite RECORD;
BEGIN
  SELECT * INTO v_invite FROM game_invites WHERE id = p_invite_id FOR UPDATE;
  IF v_invite IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Inbjudan finns inte');
  END IF;
  IF v_invite.to_session_id <> p_session_id AND v_invite.from_session_id <> p_session_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Inbjudan rör inte dig');
  END IF;
  IF v_invite.status <> 'pending' THEN
    RETURN jsonb_build_object('success', true, 'noop', true);
  END IF;
  UPDATE game_invites
  SET status = CASE WHEN v_invite.from_session_id = p_session_id THEN 'cancelled' ELSE 'declined' END,
      responded_at = now()
  WHERE id = p_invite_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_invite(uuid, text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.decline_invite(uuid, text) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.accept_invite(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.decline_invite(uuid, text) TO service_role;