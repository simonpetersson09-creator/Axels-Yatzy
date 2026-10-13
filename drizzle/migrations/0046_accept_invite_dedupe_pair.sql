CREATE OR REPLACE FUNCTION public.accept_invite(p_invite_id uuid, p_session_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invite RECORD;
  v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code TEXT;
  v_game RECORD;
  v_attempt INTEGER := 0;
  v_active_from INTEGER;
  v_active_to INTEGER;
  v_existing RECORD;
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

  -- Serialize accepts per player pair so crossed invites (A→B and B→A
  -- accepted at the same time) end up in ONE match instead of two.
  PERFORM pg_advisory_xact_lock(hashtext('invite_pair:' ||
    least(v_invite.from_session_id, v_invite.to_session_id) || ':' ||
    greatest(v_invite.from_session_id, v_invite.to_session_id)));

  -- A fresh invite match between the same two players already exists
  -- (the other direction was just accepted): join that one.
  SELECT g.id, g.game_code INTO v_existing
  FROM game_invites i JOIN games g ON g.id = i.game_id
  WHERE i.status = 'accepted'
    AND i.id <> p_invite_id
    AND i.responded_at > now() - interval '10 minutes'
    AND ((i.from_session_id = v_invite.from_session_id AND i.to_session_id = v_invite.to_session_id)
      OR (i.from_session_id = v_invite.to_session_id AND i.to_session_id = v_invite.from_session_id))
    AND g.status = 'playing' AND g.round = 1
  ORDER BY i.responded_at DESC
  LIMIT 1;
  IF v_existing.id IS NOT NULL THEN
    UPDATE game_invites
    SET status = 'accepted', game_id = v_existing.id, responded_at = now()
    WHERE id = p_invite_id;
    RETURN jsonb_build_object('success', true, 'game_id', v_existing.id, 'game_code', v_existing.game_code);
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

  -- Crossed invite still pending in the other direction: point it at this
  -- match so accepting it later (or now) joins the same game.
  UPDATE game_invites
  SET status = 'accepted', game_id = v_game.id, responded_at = now()
  WHERE status = 'pending'
    AND from_session_id = v_invite.to_session_id
    AND to_session_id = v_invite.from_session_id;

  RETURN jsonb_build_object('success', true, 'game_id', v_game.id, 'game_code', v_game.game_code);
END;
$function$;