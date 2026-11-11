DO $block$
DECLARE v_def text;
BEGIN
 SELECT pg_get_functiondef('public.accept_invite(uuid,text)'::regprocedure) INTO v_def;
 v_def := replace(v_def, 'WHERE i.status=''accepted''', 'WHERE i.status=''accepted'' AND NOT i.lobby_invite');
 v_def := replace(v_def, 'WHERE status=''pending'' AND from_session_id=', 'WHERE status=''pending'' AND NOT lobby_invite AND from_session_id=');
 IF strpos(v_def,'AND NOT i.lobby_invite')=0 OR strpos(v_def,'AND NOT lobby_invite')=0 THEN RAISE EXCEPTION 'Missing pair isolation'; END IF;
 EXECUTE v_def;
END;
$block$;