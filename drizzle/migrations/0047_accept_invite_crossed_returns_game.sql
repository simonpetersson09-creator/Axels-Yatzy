DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.accept_invite(uuid,text)'::regprocedure);
  d := replace(d,
$a$  IF v_invite.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Inbjudan är inte längre aktiv');$a$,
$b$  -- Crossed invite already linked to the pair's new match: just open it.
  IF v_invite.status = 'accepted' AND v_invite.game_id IS NOT NULL THEN
    SELECT id, game_code INTO v_game FROM games WHERE id = v_invite.game_id AND status = 'playing';
    IF v_game.id IS NOT NULL THEN
      RETURN jsonb_build_object('success', true, 'game_id', v_game.id, 'game_code', v_game.game_code);
    END IF;
  END IF;
  IF v_invite.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Inbjudan är inte längre aktiv');$b$);
  EXECUTE d;
END $$;