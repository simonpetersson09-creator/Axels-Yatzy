CREATE TABLE public.turn_push_queue (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id uuid NOT NULL,
  sender_session_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.turn_push_queue TO service_role;
ALTER TABLE public.turn_push_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages turn push queue" ON public.turn_push_queue FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.client_submit_score(p_game_id uuid, p_session_id text, p_device_id text, p_category_id text, p_expected_dice integer[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_res jsonb;
BEGIN
  IF p_session_id IS NULL OR p_device_id IS NULL OR length(p_device_id) NOT BETWEEN 8 AND 64 THEN
    RETURN jsonb_build_object('success', false, 'auth_failed', true, 'error', 'device_id required');
  END IF;
  IF p_category_id IS NULL OR length(p_category_id) > 40 THEN
    RETURN jsonb_build_object('success', false, 'error', 'category_id required');
  END IF;
  IF p_expected_dice IS NOT NULL AND array_length(p_expected_dice, 1) IS DISTINCT FROM 5 THEN
    p_expected_dice := NULL;
  END IF;
  v_res := public.perform_submit_score_authed(p_game_id, p_session_id, p_device_id, p_category_id, p_expected_dice);
  -- Turn push is sent by the database itself (pg_net fires after commit), so it
  -- never depends on the app staying open.
  IF coalesce((v_res->>'success')::boolean, false) AND NOT coalesce((v_res->>'game_over')::boolean, false) THEN
    BEGIN
      INSERT INTO turn_push_queue(game_id, sender_session_id) VALUES (p_game_id, p_session_id);
      PERFORM net.http_post(
        url := 'https://ixzqnmocplgbsawuufsm.supabase.co/functions/v1/notify-after-score',
        headers := jsonb_build_object('Content-Type','application/json',
          'apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4enFubW9jcGxnYnNhd3V1ZnNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MzA4NjcsImV4cCI6MjA4OTAwNjg2N30.q3VxFoy9DFHzJNkf6MQwmHMHJ_mymFENpch1SC67cok'),
        body := jsonb_build_object('queue', true));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN v_res;
END $$;