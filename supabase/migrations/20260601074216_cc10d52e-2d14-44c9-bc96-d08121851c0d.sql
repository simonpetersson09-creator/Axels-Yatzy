-- Rate-limit table for simple per-device throttling of debug/test endpoints
CREATE TABLE public.rate_limits (
  key TEXT PRIMARY KEY,
  last_request_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT ALL ON public.rate_limits TO service_role;

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages rate limits"
ON public.rate_limits
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);