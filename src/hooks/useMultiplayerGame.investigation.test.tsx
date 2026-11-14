import { act, renderHook } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), action: vi.fn(), roll: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  rpc: m.rpc, from: m.from, removeChannel: vi.fn(),
  channel: () => { const c = { on: () => c, subscribe: () => c, send: vi.fn() }; return c; },
} }));
vi.mock('@/lib/session', () => ({ getSessionId: () => 'me', requireClaimedDevice: async () => 'device' }));
vi.mock('@/lib/multiplayer-actions', () => ({ directRpc: m.roll, invokeDeviceAction: m.action }));
vi.mock('@/lib/i18n', () => ({ t: (key: string) => key }));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('@/lib/notifications', () => ({ clearGameNotifications: vi.fn() }));
import { useMultiplayerGame } from './useMultiplayerGame';
let game: Record<string, unknown>;
let failReads = false;
const players = [{ id: 'p1', player_name: 'Me', player_index: 0, scores: {}, is_bot: false, session_id: 'me' }, { id: 'p2', player_name: 'Other', player_index: 1, scores: {}, is_bot: false, session_id: 'other' }];
beforeEach(() => {
  vi.useFakeTimers(); failReads = false;
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  players[0] = { id: 'p1', player_name: 'Me', player_index: 0, scores: {}, is_bot: false, session_id: 'me' };
  game = { id: 'game', game_code: 'ABCDEF', status: 'playing', current_player_index: 0, dice: [1,1,1,1,1], locked_dice: [false,false,false,false,false], rolls_left: 3, round: 1, updated_at: '2026-10-24T12:00:00Z' };
  m.rpc.mockReset().mockImplementation(async (name: string) => ({ data: name === 'validate_game_session' ? { valid: true, player_index: 0 } : true, error: null }));
  m.from.mockReset().mockImplementation((table: string) => {
    const response = () => Promise.resolve(failReads ? { data: null, error: { message: 'offline' } } : { data: table === 'games' ? { ...game } : players, error: null });
    const q = { select: () => q, eq: () => q, order: response, single: response, maybeSingle: () => Promise.resolve(failReads ? { data: null, error: { message: 'offline' } } : { data: table === 'games' ? { ...game } : players[0], error: null }) }; return q;
  });
  m.roll.mockReset(); m.action.mockReset();
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });
async function joined() {
  const hook = renderHook(() => useMultiplayerGame());
  await act(async () => { await hook.result.current.rejoinGame('game'); });
  return hook;
}
describe('November 13 fault investigation — regression fixes', () => {
  it('preserves real-request ownership beyond the 15 second safety observation', async () => {
    game = { ...game, rolls_left: 2 };
    const { result, unmount } = await joined();
    let release: (value: unknown) => void = () => {};
    m.roll.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }))
      .mockResolvedValue({ data: { success: true }, error: null });
    await act(async () => { result.current.toggleLock(0); await vi.advanceTimersByTimeAsync(250); });
    await act(async () => { result.current.toggleLock(1); await vi.advanceTimersByTimeAsync(16000); });
    expect(m.roll).toHaveBeenCalledTimes(1);
    await act(async () => { result.current.toggleLock(2); await vi.advanceTimersByTimeAsync(250); });
    expect(m.roll).toHaveBeenCalledTimes(1);
    await act(async () => { release({ data: { success: true }, error: null }); });
    expect(m.roll).toHaveBeenCalledTimes(2);
    expect(m.roll.mock.calls[1]?.[2].p_locked).toEqual([true,true,true,false,false]);
    unmount();
  });
  it('a saved score with a lost answer stays visible without a false error or rollback', async () => {
    game = { ...game, rolls_left: 0, dice: [4,4,4,2,1] };
    const { result, unmount } = await joined();
    let releaseRead: (value: unknown) => void = () => {};
    const normalFrom = m.from.getMockImplementation();
    m.from.mockImplementation((table: string) => {
      if (table !== 'games') return normalFrom?.(table);
      const q = { select: () => q, eq: () => q, single: () => new Promise(resolve => { releaseRead = resolve; }) }; return q;
    });
    m.roll.mockImplementation(async () => {
      players[0] = { ...players[0], scores: { fours: 12 } };
      game = { ...game, current_player_index: 1, rolls_left: 3 };
      return { data: null, error: new TypeError('Load failed') };
    });
    await act(async () => { void result.current.selectCategory('fours'); await vi.advanceTimersByTimeAsync(1); });
    expect((players[0].scores as Record<string, number>).fours).toBe(12);
    expect(result.current.error).toBeNull();
    expect(result.current.gameState?.players[0].scores.fours).toBe(12);
    expect(result.current.rollPending).toBe(false);
    expect(m.roll).toHaveBeenCalledTimes(1);
    await act(async () => { releaseRead({ data: { ...game }, error: null }); });
    expect(result.current.gameState?.players[0].scores.fours).toBe(12);
    expect(result.current.error).toBeNull();
    unmount();
  });
  it('a pending full lock batch is never sent twice while its first request is live', async () => {
    game = { ...game, rolls_left: 2 };
    const { result, unmount } = await joined();
    m.from.mockClear();
    m.roll.mockImplementation(() => new Promise(() => {}));
    await act(async () => { result.current.toggleLock(0); await vi.advanceTimersByTimeAsync(4250); });
    expect(m.roll).toHaveBeenCalledTimes(1);
    expect(m.roll.mock.calls[0]?.[2].p_locked).toEqual([true,false,false,false,false]);
    expect(m.from).not.toHaveBeenCalled();
    unmount();
  });
  it('roll recovery never resends after a network rejection while document is hidden', async () => {
    const { result, unmount } = await joined();
    m.roll.mockRejectedValueOnce(new TypeError('Load failed'))
      .mockResolvedValue({ data: { success: true, dice: [2,3,4,5,6], rolls_left: 2 }, error: null });
    await act(async () => { void result.current.roll(); await vi.advanceTimersByTimeAsync(10); });
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(4500); });
    expect(m.roll).toHaveBeenCalledTimes(1);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(m.roll).toHaveBeenCalledTimes(2);
    expect(result.current.gameState?.dice).toEqual([2,3,4,5,6]);
    unmount();
  });
  it('later lock batches wait for the actual request even beyond its 12 second UI deadline', async () => {
    game = { ...game, rolls_left: 2 };
    const { result, unmount } = await joined();
    let release: (value: unknown) => void = () => {};
    m.roll.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }))
      .mockResolvedValue({ data: { success: true }, error: null });
    await act(async () => { result.current.toggleLock(0); await vi.advanceTimersByTimeAsync(250); });
    await act(async () => { result.current.toggleLock(1); await vi.advanceTimersByTimeAsync(12500); });
    expect(m.roll).toHaveBeenCalledTimes(1);
    await act(async () => { release({ data: { success: true }, error: null }); });
    expect(m.roll).toHaveBeenCalledTimes(2);
    expect(m.roll.mock.calls[1]?.[2].p_locked).toEqual([true,true,false,false,false]);
    unmount();
  });
  it('a score with no response is not resent while the original remains pending', async () => {
    game = { ...game, rolls_left: 0, dice: [4,4,4,2,1] };
    const { result, unmount } = await joined();
    m.roll.mockImplementation(() => new Promise(() => {}));
    await act(async () => { void result.current.selectCategory('fours'); await vi.advanceTimersByTimeAsync(6000); });
    expect(m.roll).toHaveBeenCalledTimes(1);
    expect(result.current.pendingCategory).toBe('fours');
    unmount();
  });
});
