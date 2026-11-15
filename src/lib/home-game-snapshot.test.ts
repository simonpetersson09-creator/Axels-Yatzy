import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: (table: string) => ({ select: () => ({ in: (_key: string, ids: string[]) => mocks.read(table, ids) }) }),
} }));
import { fetchHomeGameSnapshot, watchHomeGameSnapshot } from './home-game-snapshot';
afterEach(() => vi.useRealTimers());
beforeEach(() => { mocks.read.mockReset(); });
it.each(['games', 'game_players'])('treats a failed %s read as unknown, not deleted', async table => {
  mocks.read.mockImplementation(async (name: string) => name === table
    ? { data: null, error: { message: 'offline' } } : { data: [], error: null });
  expect(await fetchHomeGameSnapshot(['saved-game'])).toBeNull();
});
it('automatically retries a failed snapshot and stops refreshing after unmount', async () => {
  vi.useFakeTimers();
  mocks.read.mockResolvedValue({ data: null, error: { message: 'offline' } });
  const receive = vi.fn();
  const stop = watchHomeGameSnapshot(['saved-game'], receive);
  await vi.advanceTimersByTimeAsync(0);
  expect(receive).not.toHaveBeenCalled();
  mocks.read.mockResolvedValue({ data: [], error: null });
  await vi.advanceTimersByTimeAsync(5000);
  expect(receive).toHaveBeenCalledExactlyOnceWith({ games: [], players: [] });
  stop();
  await vi.advanceTimersByTimeAsync(30000);
  expect(receive).toHaveBeenCalledTimes(1);
});
it('does not overlap pending reads or publish their results after unmount', async () => {
  vi.useFakeTimers();
  let finish: ((value: { data: never[]; error: null }) => void) | undefined;
  const pending = new Promise(resolve => { finish = resolve; });
  mocks.read.mockReturnValue(pending);
  const receive = vi.fn();
  const stop = watchHomeGameSnapshot(['saved-game'], receive);
  await vi.advanceTimersByTimeAsync(30000);
  expect(mocks.read).toHaveBeenCalledTimes(2);
  stop();
  finish?.({ data: [], error: null });
  await vi.advanceTimersByTimeAsync(0);
  expect(receive).not.toHaveBeenCalled();
});
it('handles a rejected transport without losing the saved match', async () => {
  mocks.read.mockRejectedValue(new Error('network failed'));
  expect(await fetchHomeGameSnapshot(['saved-game'])).toBeNull();
});
it.each(['games', 'game_players'])('treats missing %s data as unknown even without an error', async table => {
  mocks.read.mockImplementation(async (name: string) => ({ data: name === table ? null : [], error: null }));
  expect(await fetchHomeGameSnapshot(['saved-game'])).toBeNull();
});
it('accepts confirmed empty results so deleted games can still be removed', async () => {
  mocks.read.mockResolvedValue({ data: [], error: null });
  expect(await fetchHomeGameSnapshot(['deleted-game'])).toEqual({ games: [], players: [] });
});
it('recovers with current game and seat data on the next successful read', async () => {
  mocks.read.mockResolvedValueOnce({ data: null, error: { message: 'offline' } })
    .mockResolvedValueOnce({ data: [], error: null });
  expect(await fetchHomeGameSnapshot(['saved-game'])).toBeNull();
  const game = { id: 'saved-game', status: 'playing', current_player_index: 0 };
  const seat = { game_id: 'saved-game', session_id: 'me', player_index: 0 };
  mocks.read.mockImplementation(async (table: string) => ({ data: [table === 'games' ? game : seat], error: null }));
  expect(await fetchHomeGameSnapshot(['saved-game'])).toEqual({ games: [game], players: [seat] });
});