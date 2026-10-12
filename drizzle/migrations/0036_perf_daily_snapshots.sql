CREATE TABLE public.perf_snapshots (
  id bigserial PRIMARY KEY,
  taken_at timestamptz NOT NULL DEFAULT now(),
  query text NOT NULL,
  calls bigint NOT NULL,
  mean_ms double precision NOT NULL,
  max_ms double precision NOT NULL,
  total_ms double precision NOT NULL
);
GRANT ALL ON public.perf_snapshots TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.perf_snapshots_id_seq TO service_role;
ALTER TABLE public.perf_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages perf snapshots" ON public.perf_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.internal_snapshot_perf() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE n integer;
BEGIN
  INSERT INTO public.perf_snapshots(query, calls, mean_ms, max_ms, total_ms)
  SELECT left(s.query, 300), s.calls, s.mean_exec_time, s.max_exec_time, s.total_exec_time
  FROM extensions.pg_stat_statements s
  WHERE s.query ~* '(perform_|heartbeat|validate_game_session|accept_invite|list_invites_for_session|get_world_leaders)'
  ORDER BY s.total_exec_time DESC LIMIT 40;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.internal_snapshot_perf() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('perf-daily-snapshot', '55 21 * * *', 'select public.internal_snapshot_perf()');