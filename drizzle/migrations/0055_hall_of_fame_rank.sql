CREATE OR REPLACE FUNCTION public.internal_hof_rank(p_session_id text) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT CASE WHEN me.best_score > 0 THEN (
    SELECT count(*)::int + 1 FROM public.weekly_hall_of_fame o
    WHERE o.week_start = me.week_start AND o.session_id <> me.session_id
      AND (o.best_score > me.best_score OR (o.best_score = me.best_score AND o.best_at < me.best_at))
  ) END
  FROM public.weekly_hall_of_fame me
  WHERE me.session_id = p_session_id AND me.week_start = public.internal_hof_week()
$$;

CREATE OR REPLACE FUNCTION public.report_weekly_score_ranked(p_session_id text, p_device_id text, p_name text, p_score integer, p_country text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_before integer; v_after integer; v_ok boolean;
BEGIN
  v_before := public.internal_hof_rank(p_session_id);
  v_ok := public.report_weekly_score(p_session_id, p_device_id, p_name, p_score, p_country);
  IF NOT v_ok THEN RETURN jsonb_build_object('ok', false); END IF;
  v_after := public.internal_hof_rank(p_session_id);
  RETURN jsonb_build_object('ok', true, 'before', v_before, 'after', v_after);
END $$;

CREATE OR REPLACE FUNCTION public.get_my_hof_rank(p_session_id text) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT public.internal_hof_rank(p_session_id) $$;

REVOKE ALL ON FUNCTION public.internal_hof_rank(text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_weekly_score_ranked(text, text, text, integer, text) FROM public;
GRANT EXECUTE ON FUNCTION public.report_weekly_score_ranked(text, text, text, integer, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_hof_rank(text) TO anon, authenticated;