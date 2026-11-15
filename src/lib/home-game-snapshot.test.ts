import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: (table: string) => ({ select: () => ({ in: (_key: string, ids: string[]) => mocks.read(table, ids) }) }),
} }));
import { fetchHomeGameSnapshot } from './home-game-snapshot';
beforeEach(() => { mocks.read.mockReset(); });
it.each(['games', 'game_players'])('treats a failed %s read as unknown, not deleted', async table => {
  mocks.read.mockImplementation(async (name: string) => name === table
    ? { data: null, error: { message: 'offline' } } : { data: [], error: null });
  expect(await fetchHomeGameSnapshot(['saved-game'])).toBeNull();
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