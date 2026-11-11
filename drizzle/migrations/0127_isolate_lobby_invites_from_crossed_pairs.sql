DO $block$
DECLARE v_def text;
BEGIN
 SELECT pg_get_functiondef('public.accept_invite(uuid,text)'::regprocedure) INTO v_def;
 v_def := replace(v_def, 'WHERE i.status = ''accepted''', 'WHERE i.status = ''accepted'' AND NOT i.lobby_invite');
 v_def := replace(v_def, 'WHERE status = ''pending''', 'WHERE status = ''pending'' AND NOT lobby_invite');
 EXECUTE v_def;
END;
$block$;