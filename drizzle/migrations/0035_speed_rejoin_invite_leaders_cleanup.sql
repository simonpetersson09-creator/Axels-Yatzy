-- 1) Rejoin check: one plain SQL lookup.
CREATE OR REPLACE FUNCTION public.validate_game_session(p_game_id uuid, p_session_id text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN g.id IS NULL THEN jsonb_build_object('valid', false, 'error', 'Spelet finns inte')
    WHEN p.id IS NULL THEN jsonb_build_object('valid', false, 'error', 'Du tillhör inte detta spel')
    ELSE jsonb_build_object('valid', true, 'game_id', g.id, 'game_code', g.game_code,
      'status', g.status, 'player_index', p.player_index, 'forfeited_by', g.forfeited_by)
  END
  FROM (SELECT 1) one
  LEFT JOIN games g ON g.id = p_game_id
  LEFT JOIN game_players p ON p.game_id = g.id AND p.session_id = p_session_id;
$$;

-- 2) Accept invite: both "max 3 active games" counts in one query.
CREATE OR REPLACE FUNCTION public.accept_invite(p_invite_id uuid, p_session_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
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

  SELECT count(*) FILTER (WHERE gp.session_id = v_invite.from_session_id),
         count(*) FILTER (WHERE gp.session_id = v_invite.to_session_id)
    INTO v_active_from, v_active_to
  FROM game_players gp JOIN games g ON g.id = gp.game_id
  WHERE gp.session_id IN (v_invite.from_session_id, v_invite.to_session_id)
    AND g.status IN ('waiting','playing');
  IF v_active_from >= 3 THEN
    RETURN jsonb_build_object('success', false, 'error', v_invite.from_name || ' har redan 3 aktiva spel');
  END IF;
  IF v_active_to >= 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Du har redan 3 aktiva spel');
  END IF;

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

  RETURN jsonb_build_object('success', true, 'game_id', v_game.id, 'game_code', v_game.game_code);
END;
$function$;

-- 3) World leaders: cached for 60 s instead of recomputed on every app open.
CREATE TABLE IF NOT EXISTS public.world_leaders_cache (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.world_leaders_cache TO service_role;
ALTER TABLE public.world_leaders_cache ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_world_leaders()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_cached jsonb;
  v_leaders jsonb;
  v_result jsonb;
BEGIN
  SELECT data INTO v_cached FROM world_leaders_cache
  WHERE id = 1 AND updated_at > now() - interval '60 seconds';
  IF v_cached IS NOT NULL THEN RETURN v_cached; END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('country', sub.country, 'games_played', sub.games_played) ORDER BY sub.ord
  ), '[]'::jsonb)
  INTO v_leaders
  FROM (
    SELECT t.country,
      COALESCE(SUM(t.games_played), 0)::int AS games_played,
      ROW_NUMBER() OVER (ORDER BY SUM(t.games_played) DESC) AS ord
    FROM public.trusted_country_stats() t
    GROUP BY t.country
    ORDER BY SUM(t.games_played) DESC
    LIMIT 3
  ) sub;

  IF jsonb_array_length(v_leaders) = 0 THEN
    v_result := jsonb_build_object('found', false, 'leaders', '[]'::jsonb);
  ELSE
    v_result := jsonb_build_object('found', true, 'leaders', v_leaders);
  END IF;

  INSERT INTO world_leaders_cache (id, data, updated_at) VALUES (1, v_result, now())
  ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at;
  RETURN v_result;
END;
$function$;

-- 4) Background cleanup: skip matches that are busy right now, and use small indexes.
CREATE INDEX IF NOT EXISTS games_active_updated_idx ON public.games (updated_at)
  WHERE status IN ('waiting'::public.game_status, 'playing'::public.game_status);
CREATE INDEX IF NOT EXISTS games_waiting_created_idx ON public.games (created_at)
  WHERE status = 'waiting'::public.game_status;

CREATE OR REPLACE FUNCTION public.cleanup_unjoined_lobbies()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_count integer;
BEGIN
  WITH stale AS (
    SELECT g.id FROM public.games g
    WHERE g.status = 'waiting'::public.game_status
      AND g.created_at < now() - interval '10 minutes'
      AND (SELECT count(*) FROM public.game_players gp WHERE gp.game_id = g.id) < 2
    FOR UPDATE SKIP LOCKED
  ), updated AS (
    UPDATE public.games g
    SET status = 'finished'::public.game_status,
        forfeited_by = COALESCE(g.forfeited_by, 'Ej accepterad')
    FROM stale WHERE g.id = stale.id
    RETURNING g.id
  )
  SELECT count(*) INTO v_count FROM updated;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.expire_stale_matches()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_count integer;
BEGIN
  WITH stale AS (
    SELECT g.id FROM public.games g
    WHERE g.status IN ('waiting'::public.game_status, 'playing'::public.game_status)
      AND g.updated_at < now() - interval '48 hours'
      AND g.created_at < now() - interval '48 hours'
    FOR UPDATE SKIP LOCKED
  ), cleared AS (
    DELETE FROM public.friend_match_results f
    USING stale WHERE f.game_id = stale.id::text
    RETURNING f.game_id
  ), updated AS (
    UPDATE public.games g
    SET status = 'finished'::public.game_status, forfeited_by = 'Tidsgräns'
    FROM stale WHERE g.id = stale.id
    RETURNING g.id
  )
  SELECT count(*) INTO v_count FROM updated;
  RETURN v_count;
END;
$function$;