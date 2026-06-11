CREATE OR REPLACE FUNCTION public.internal_secret_matches(p_secret text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'internal_notify_secret'
      AND decrypted_secret = p_secret
  );
$$;

REVOKE EXECUTE ON FUNCTION public.internal_secret_matches(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.internal_secret_matches(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.internal_secret_matches(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.internal_secret_matches(text) TO service_role;