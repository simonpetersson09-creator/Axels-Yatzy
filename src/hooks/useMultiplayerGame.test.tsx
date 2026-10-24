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
const players = [{ id: 'p1', player_name: 'Me', player_index: 0, scores: {}, is_bot: false }, { id: 'p2', player_name: 'Other', player_index: 1, scores: {}, is_bot: false }];
beforeEach(() => {
  vi.useFakeTimers(); failReads = false;
  game = { id: 'game', game_code: 'ABCDEF', status: 'playing', current_player_index: 0, dice: [1,1,1,1,1], locked_dice: [false,false,false,false,false], rolls_left: 3, round: 1, updated_at: '2026-10-24T12:00:00Z' };
  m.rpc.mockReset().mockImplementation(async (name: string) => ({ data: name === 'validate_game_session' ? { valid: true, player_index: 0 } : true, error: null }));
  m.from.mockReset().mockImplementation((table: string) => {
    const response = () => Promise.resolve(failReads ? { data: null, error: { message: 'offline' } } : { data: table === 'games' ? { ...game } : players, error: null });
    const q = { select: () => q, eq: () => q, order: response, single: response, maybeSingle: response }; return q;
  });
  m.roll.mockReset(); m.action.mockReset();
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
async function joined() {
  const hook = renderHook(() => useMultiplayerGame());
  await act(async () => { await hook.result.current.rejoinGame('game'); });
  return hook;
}
describe('authoritative multiplayer recovery', () => {
  it('failed first roll restores three rolls and never permits scoring', async () => {
    m.roll.mockResolvedValue({ data: null, error: new Error('Load failed') });
    const { result } = await joined();
    await act(async () => { void result.current.roll(); await vi.advanceTimersByTimeAsync(2200); });
    expect(result.current.gameState?.rollsLeft).toBe(3);
    expect(result.current.rollPending).toBe(false);
    expect(result.current.getPossibleScores()).toBeNull();
    await act(async () => { await result.current.selectCategory('yatzy'); });
    expect(m.roll).toHaveBeenCalledTimes(1);
  });
  it('failed refresh keeps scores blocked until a successful retry restores server state', async () => {
    const { result } = await joined(); failReads = true;
    m.roll.mockResolvedValue({ data: null, error: new Error('offline') });
    await act(async () => { void result.current.roll(); await vi.advanceTimersByTimeAsync(2200); });
    expect(result.current.rollPending).toBe(true);
    expect(result.current.getPossibleScores()).toBeNull();
    await act(async () => { await result.current.selectCategory('ones'); });
    expect(m.roll).toHaveBeenCalledTimes(1);
    failReads = false;
    await act(async () => { await result.current.retryConnection(); });
    expect(result.current.gameState?.rollsLeft).toBe(3);
    expect(result.current.rollPending).toBe(false);
  });
  it('lost roll response recovers the committed server dice without sending another roll', async () => {
    const { result } = await joined();
    m.roll.mockImplementation(() => new Promise(() => {}));
    await act(async () => { void result.current.roll(); await vi.advanceTimersByTimeAsync(10); });
    game = { ...game, rolls_left: 2, dice: [6,6,6,6,6] };
    await act(async () => { await vi.advanceTimersByTimeAsync(4500); });
    expect(result.current.gameState?.dice).toEqual([6,6,6,6,6]);
    expect(result.current.gameState?.rollsLeft).toBe(2);
    expect(result.current.getPossibleScores()?.yatzy).toBe(50);
    expect(m.roll).toHaveBeenCalledTimes(1);
  });
  it('forfeit stays on playing state until acceptance and rejects duplicate taps', async () => {
    const { result } = await joined();
    let resolve: (value: unknown) => void = () => {};
    m.action.mockImplementation(() => new Promise(r => { resolve = r; }));
    await act(async () => { void result.current.forfeitGame(); void result.current.forfeitGame(); });
    expect(result.current.status).toBe('playing'); expect(result.current.forfeiting).toBe(true);
    expect(m.action).toHaveBeenCalledTimes(1);
    await act(async () => { resolve({ data: { success: true, game_ended: false }, error: null }); });
    expect(result.current.status).toBe('finished');
    expect(result.current.gameState?.forfeitedBySessionId).toBe('me');
  });
  it('failed forfeit never presents a finished match', async () => {
    m.action.mockRejectedValue(new Error('offline'));
    const { result } = await joined();
    await act(async () => { await result.current.forfeitGame(); });
    expect(result.current.status).toBe('playing');
    expect(result.current.gameState?.forfeitedBySessionId ?? null).toBeNull();
    expect(result.current.forfeiting).toBe(false);
  });
  it('pending last score never exposes a confirmed finished board or permits another action', async () => {
    game = { ...game, rolls_left: 0, dice: [6,6,6,6,6] };
    const { result } = await joined();
    let resolve: (value: unknown) => void = () => {};
    m.roll.mockImplementation(() => new Promise(r => { resolve = r; }));
    await act(async () => { void result.current.selectCategory('yatzy'); await vi.advanceTimersByTimeAsync(900); });
    expect(result.current.pendingCategory).toBe('yatzy');
    await act(async () => { await result.current.roll(); await result.current.selectCategory('ones'); });
    expect(m.roll).toHaveBeenCalledTimes(1);
    await act(async () => { resolve({ data: { success: true, score: 50 }, error: null }); });
    expect(result.current.pendingCategory).toBeNull();
  });
});