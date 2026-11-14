import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

/** Observe only this request, after the existing client's session check.
 * No global fetch patch, alternative credentials, cancellation or retries.
 * Fetch entry is a client transport boundary, not proof of server receipt.
 */
export function observedRpc(
  rpc: string,
  args: Record<string, unknown>,
  onFetchStarted: () => void,
) {
  const client = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    {
      // This transport has no independent auth state or refresh lifecycle.
      accessToken: async () => null,
      global: {
        fetch: async (input, init) => {
          const { data } = await supabase.auth.getSession();
          const headers = new Headers(init?.headers);
          headers.set('Authorization', `Bearer ${data.session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`);
          try { onFetchStarted(); } catch { /* Measurement cannot block play. */ }
          return globalThis.fetch(input, { ...init, headers });
        },
      },
    },
  );
  return client.rpc(rpc, args);
}