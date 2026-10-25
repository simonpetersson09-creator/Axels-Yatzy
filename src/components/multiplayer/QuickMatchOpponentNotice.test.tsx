import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ lookup: vi.fn(), rank: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: () => { const q = { select: () => q, eq: () => q, maybeSingle: api.lookup }; return q; },
  rpc: api.rank,
} }));
vi.mock('framer-motion', () => ({ AnimatePresence: ({ children }: any) => children, motion: { div: ({ children, initial, animate, exit, ...props }: any) => <div {...props}>{children}</div> } }));
import Notice from './QuickMatchOpponentNotice';
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  api.lookup.mockResolvedValue({ data: { session_id: 'opponent' } });
  api.rank.mockResolvedValue({ data: { country: 'ES' } });
});
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); });
const humans = () => [{ name: 'Simon', badge: 'online' }, { name: 'Opponent', badge: 'online' }];
it('hides the human introduction after 2 seconds despite score updates', async () => {
  const view = render(<Notice gameId="game" players={humans()} myIndex={0} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(view.container.textContent).toContain('Opponent');
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  view.rerender(<Notice gameId="game" players={humans()} myIndex={0} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(view.container.textContent).toBe('');
});
it('hides the takeover after 4 seconds despite further game updates', async () => {
  const view = render(<Notice gameId="game" players={humans()} myIndex={0} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
  const bots = () => [{ name: 'Simon', badge: 'online' }, { name: 'Astrid', badge: 'bot' }];
  view.rerender(<Notice gameId="game" players={bots()} myIndex={0} />);
  expect(view.container.textContent).toContain('Astrid');
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  view.rerender(<Notice gameId="game" players={bots()} myIndex={0} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(view.container.textContent).toBe('');
});
it('does not introduce a computer-only or friend match', async () => {
  const view = render(<Notice gameId="game" players={[{ name: 'Simon' }, { name: 'Astrid', badge: 'bot' }]} myIndex={0} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(view.container.textContent).toBe('');
  expect(api.lookup).not.toHaveBeenCalled();
});
it('retries a pending introduction after the opponent snapshot changes', async () => {
  let resolve: (value: unknown) => void = () => {};
  api.lookup.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  const view = render(<Notice gameId="game" players={humans()} myIndex={0} />);
  view.rerender(<Notice gameId="game" players={[{ name: 'Simon', badge: 'online' }, { name: 'Updated', badge: 'online' }]} myIndex={0} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); resolve({ data: null }); });
  expect(view.container.textContent).toContain('Updated');
  expect(view.container.textContent).not.toContain('Opponent');
});
it('cleans up notices when leaving and introduces a different match anew', async () => {
  const view = render(<Notice gameId="first" players={humans()} myIndex={0} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  view.rerender(<Notice gameId="second" players={humans()} myIndex={0} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(api.lookup).toHaveBeenCalledTimes(2);
  expect(view.container.textContent).toContain('Opponent');
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});