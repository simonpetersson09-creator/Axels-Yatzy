// A transport abort does not prove the database stopped executing.
// Keep the legacy API, but never start a second mutation after a timeout.
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
  return { data: first.data, error: first.error ?? new Error('timeout'), retried: false };
}
