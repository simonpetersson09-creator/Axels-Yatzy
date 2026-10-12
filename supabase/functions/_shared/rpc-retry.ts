// Calls a database function with a time limit. If the database path hangs
// (seen as 20–70 s stalls), the first try is abandoned after `timeoutMs` and
// one fresh attempt is made. Only use for calls that are safe to repeat.
// deno-lint-ignore no-explicit-any
export async function rpcWithRetry(supabase: any, fn: string, args: Record<string, unknown>, timeoutMs = 2500) {
  const attempt = async (limit: number | null) => {
    if (limit === null) return { ...(await supabase.rpc(fn, args)), timedOut: false };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), limit);
    try {
      const r = await supabase.rpc(fn, args).abortSignal(ctrl.signal);
      const timedOut = ctrl.signal.aborted;
      return { ...r, timedOut };
    } finally {
      clearTimeout(timer);
    }
  };
  const first = await attempt(timeoutMs);
  if (!first.timedOut) return { data: first.data, error: first.error, retried: false };
  const second = await attempt(null);
  return { data: second.data, error: second.error, retried: true };
}
