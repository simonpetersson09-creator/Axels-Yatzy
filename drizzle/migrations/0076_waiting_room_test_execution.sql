-- The isolated QA connection can call the same device-checked entry point;
-- no table privileges or internal-function execution are widened.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sandbox_exec') THEN
   GRANT EXECUTE ON FUNCTION public.waiting_room_action(text,text,text,uuid,text,boolean,boolean) TO sandbox_exec;
 END IF;
END $$;