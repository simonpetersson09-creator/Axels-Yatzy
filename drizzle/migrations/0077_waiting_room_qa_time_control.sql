-- QA-only clock fixtures; never granted to API roles. Tests roll back all changes.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sandbox_exec') THEN
   GRANT UPDATE(countdown_at) ON public.waiting_room_state TO sandbox_exec;
   GRANT UPDATE(last_seen_at,expires_at,recall_until) ON public.waiting_room_seats TO sandbox_exec;
 END IF;
END $$;