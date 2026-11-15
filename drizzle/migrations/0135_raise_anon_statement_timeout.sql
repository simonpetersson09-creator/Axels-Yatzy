ALTER ROLE anon SET statement_timeout = '8s';
NOTIFY pgrst, 'reload config';