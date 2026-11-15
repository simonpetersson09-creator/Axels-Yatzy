import { act, renderHook } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), action: vi.fn(), roll: vi.fn(), handlers: {} as Record<string, (msg: unknown) => void> }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  rpc: m.rpc, from: m.from, removeChannel: vi.fn(),
  channel: () => {
    const c = {
      on: (_type: string, filter: { event?: string }, cb: (msg: unknown) => void) => { if (filter?.event) m.handlers[filter.event] = cb; return c; },
      subscribe: () => c, send: vi.fn(),
    };
    return c;
  },
} }));
vi.mock('@/lib/session', () => ({ getSessionId: () => 'me', requireClaimedDevice: async () => 'device' }));
vi.mock('@/lib/multiplayer-actions', () => ({ directRpc: m.roll, invokeDeviceAction: m.action }));
vi.mock('@/lib/i18n', () => ({ t: (key: string) => key }));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('@/lib/notifications', () => ({ clearGameNotifications: vi.fn() }));
import { useMultiplayerGame } from './useMultiplayerGame';
import { diceAwait } from '@/components/dice-engine/await-store';

let game: Record<string, unknown>;
let held: Array<() => void> = [];
const releaseRead = () => { const h = held; held = []; h.forEach(f => f()); };
let holdReads = false;
const players = [
  { id: 'p1', player_name: 'Me', player_index: 0, scores: {}, is_bot: false, session_id: 'me' },
  { id: 'p2', player_name: 'Other', player_index: 1, scores: {}, is_bot: false, session_id: 'other' },
];
beforeEach(() => {
  vi.useFakeTimers(); holdReads = false; held = [];
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  game = { id: 'game', game_code: 'ABCDEF', status: 'playing', current_player_index: 0, dice: [2,3,4,5,6], locked_dice: [false,false,false,false,false], rolls_left: 3, round: 1, updated_at: '2026-11-15T12:00:00Z' };
  m.rpc.mockReset().mockImplementation(async (name: string) => ({ data: name === 'validate_game_session' ? { valid: true, player_index: 0 } : true, error: null }));
  m.from.mockReset().mockImplementation((table: string) => {
    const data = () => ({ data: table === 'games' ? { ...game } : players, error: null });
    const response = () => holdReads
      ? new Promise(resolve => { held.push(() => resolve(data())); })
      : Promise.resolve(data());
    const q = { select: () => q, eq: () => q, order: response, single: response, maybeSingle: () => Promise.resolve({ data: table === 'games' ? { ...game } : players[0], error: null }) };
    return q;
  });
  m.roll.mockReset(); m.action.mockReset();
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });
async function joined() {
  const hook = renderHook(() => useMultiplayerGame());
  await act(async () => { await hook.result.current.rejoinGame('game'); });
  return hook;
}

describe('online dice sync', () => {
  it("holds the opponent's kept dice still from the start of their roll", async () => {
    game = { ...game, current_player_index: 1, rolls_left: 2 };
    const { result, unmount } = await joined();
    expect(result.current.gameState?.lockedDice).toEqual([false,false,false,false,false]);
    await act(async () => {
      m.handlers.roll_started({ payload: { player: 1, lockedDice: [true,false,true,false,false], rollsLeft: 1 } });
    });
    expect(result.current.remoteRolling).toBe(true);
    expect(result.current.gameState?.lockedDice).toEqual([true,false,true,false,false]);
    expect(result.current.gameState?.rollsLeft).toBe(1);
    unmount();
  });

  it('keeps a failed roll tumbling until the confirmed match state has loaded', async () => {
    const { result, unmount } = await joined();
    m.roll.mockResolvedValue({ data: null, error: { message: 'canceling statement due to statement timeout' } });
    holdReads = true;
    await act(async () => { void result.current.roll(); await vi.advanceTimersByTimeAsync(100); });
    expect(diceAwait.active).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(diceAwait.active).toBe(true);
    await act(async () => { releaseRead(); await vi.advanceTimersByTimeAsync(50); });
    expect(diceAwait.active).toBe(false);
    expect(result.current.gameState?.dice).toEqual([2,3,4,5,6]);
    expect(result.current.gameState?.rollsLeft).toBe(3);
    unmount();
  });
});
