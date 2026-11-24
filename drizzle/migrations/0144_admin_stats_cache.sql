CREATE TABLE public.admin_stats_cache (id integer PRIMARY KEY CHECK (id = 1), data jsonb NOT NULL, computed_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.admin_stats_cache TO service_role;
ALTER TABLE public.admin_stats_cache ENABLE ROW LEVEL SECURITY;