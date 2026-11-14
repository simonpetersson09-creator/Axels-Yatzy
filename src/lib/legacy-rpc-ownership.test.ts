import { expect, it, vi } from 'vitest';
import { rpcWithRetry } from '../../supabase/functions/_shared/rpc-retry';

it('an aborted legacy lock request never launches a concurrent mutation', async () => {
  vi.useFakeTimers();
  try {
    const rpc = vi.fn(() => ({ abortSignal: (signal: AbortSignal) => new Promise(resolve => {
      signal.addEventListener('abort', () => resolve({data:null,error:new Error('aborted')}));
    }) }));
    const pending = rpcWithRetry({rpc}, 'perform_set_locks_authed', {});
    await vi.advanceTimersByTimeAsync(2500);
    const result = await pending;
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(result.retried).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
  } finally { vi.useRealTimers(); }
});
it('a successful legacy score keeps the original result and sends once', async () => {
  const rpc = vi.fn(() => ({abortSignal: async () => ({data:{success:true,score:12},error:null})}));
  expect(await rpcWithRetry({rpc}, 'perform_submit_score_authed', {})).toEqual({data:{success:true,score:12},error:null,retried:false});
  expect(rpc).toHaveBeenCalledTimes(1);
});