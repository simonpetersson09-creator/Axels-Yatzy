DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sandbox_exec') THEN
   GRANT EXECUTE ON FUNCTION public.waiting_room_count(text) TO sandbox_exec;
 END IF;
END $$;