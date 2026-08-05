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
  IF v_invite.status <> 'pending'::invite_status THEN
    RETURN jsonb_build_object('success', true, 'noop', true);
  END IF;
  UPDATE game_invites
  SET status = (CASE WHEN v_invite.from_session_id = p_session_id THEN 'cancelled' ELSE 'declined' END)::invite_status,
      responded_at = now()
  WHERE id = p_invite_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.decline_invite(uuid, text) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.decline_invite(uuid, text) TO service_role;