import { afterEach, expect, it, vi } from 'vitest';
import { createCoalescedRefresh } from './coalesced-refresh';
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
it('merges a burst into one read and preserves one follow-up for changes during that read', async () => {
  vi.useFakeTimers();
  let resolve: () => void = () => {};
  const read = vi.fn().mockImplementationOnce(() => new Promise<void>(r => { resolve = r; })).mockResolvedValue(undefined);
  const refresh = createCoalescedRefresh(read);
  for (let i = 0; i < 30; i++) refresh.schedule();
  await vi.advanceTimersByTimeAsync(100);
  expect(read).toHaveBeenCalledTimes(1);
  for (let i = 0; i < 30; i++) refresh.schedule();
  resolve();
  await vi.advanceTimersByTimeAsync(100);
  expect(read).toHaveBeenCalledTimes(2);
  refresh.dispose();
});
it('never runs a queued follow-up after disposal', async () => {
  vi.useFakeTimers();
  let resolve: () => void = () => {};
  const read = vi.fn(() => new Promise<void>(r => { resolve = r; }));
  const refresh = createCoalescedRefresh(read);
  void refresh.refresh(); refresh.schedule(); refresh.dispose(); resolve();
  await vi.advanceTimersByTimeAsync(1000);
  expect(read).toHaveBeenCalledTimes(1);
});