import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

/** Transport facts for one observed request. Only technical values; no bodies or credentials. */
export type ObservedHeaders = {
  status: number;
  /** Server `Date` header (CORS-exposed, second resolution) for clock alignment. */
  serverDate: string | null;
  /** Gateway request ID when the browser may read it; null when CORS hides it. */
  gatewayRequestId: string | null;
};
export type ObservedTransport = {
  onHeaders?: (info: ObservedHeaders) => void;
  onBodyRead?: (info: { bytes: number }) => void;
  onBodyError?: (info: { errorName: string }) => void;
  onTransportError?: (info: { errorName: string }) => void;
};

const NULL_BODY_STATUS = new Set([101, 204, 205, 304]);
const safely = (fn: () => void) => { try { fn(); } catch { /* Measurement cannot block play. */ } };
const errorName = (error: unknown) => (error && typeof error === 'object' && typeof (error as { name?: unknown }).name === 'string'
  ? (error as { name: string }).name : 'Error').slice(0, 40);

/** Observe only this request, after the existing client's session check.
 * No global fetch patch, alternative credentials, cancellation or retries.
 * Fetch entry is a client transport boundary, not proof of server receipt.
 * The body is read once here (same bytes, same status/headers) so that
 * header arrival and body completion are separately measurable.
 */
export function observedRpc(
  rpc: string,
  args: Record<string, unknown>,
  onFetchStarted: () => void,
  onHeadersReceived?: () => void,
  observer?: ObservedTransport,
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
          safely(onFetchStarted);
          let response: Response;
          try { response = await globalThis.fetch(input, { ...init, headers }); }
          catch (error) { safely(() => observer?.onTransportError?.({ errorName: errorName(error) })); throw error; }
          safely(() => onHeadersReceived?.());
          safely(() => observer?.onHeaders?.({
            status: response.status,
            serverDate: response.headers.get('date'),
            gatewayRequestId: response.headers.get('sb-request-id'),
          }));
          if (!observer) return response;
          let text: string;
          try { text = await response.text(); }
          catch (error) { safely(() => observer.onBodyError?.({ errorName: errorName(error) })); throw error; }
          safely(() => observer.onBodyRead?.({ bytes: text.length }));
          return new Response(NULL_BODY_STATUS.has(response.status) ? null : text, {
            status: response.status, statusText: response.statusText, headers: response.headers,
          });
        },
      },
    },
  );
  return client.rpc(rpc, args);
}
