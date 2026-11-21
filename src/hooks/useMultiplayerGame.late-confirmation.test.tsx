import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), direct: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  rpc: m.rpc, from: m.from, removeChannel: vi.fn(),
  channel: () => { const c = { on: () => c, subscribe: () => c, send: vi.fn() }; return c; },
} }));
vi.mock('@/lib/session', () => ({ getSessionId: () => 'me', requireClaimedDevice: async () => 'device' }));
vi.mock('@/lib/multiplayer-actions', () => ({ directRpc: m.direct, invokeDeviceAction: vi.fn() }));
vi.mock('@/lib/i18n', () => ({ t: (key: string) => key }));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('@/lib/notifications', () => ({ clearGameNotifications: vi.fn() }));
import { useMultiplayerGame } from './useMultiplayerGame';
import { trackEvent } from '@/lib/analytics';

let game: Record<string, unknown>;
let players: { id: string; player_name: string; player_index: number; session_id: string; is_bot: boolean; scores: Record<string, number> }[];
let slowCheckMs: number;
let slowLockReadMs: number;
let ownIndex: number;
let checkCount: number;
let gameReadCount: number;
const reply = (data: unknown) => ({ data, error: null });
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  slowCheckMs = 0; slowLockReadMs = 0; ownIndex = 0; checkCount = 0; gameReadCount = 0;
  game = { id: 'game', game_code: 'ABCDEF', status: 'playing', current_player_index: 0,
    dice: [6,6,6,6,6], locked_dice: [false,false,false,false,false], rolls_left: 2, round: 1,
    updated_at: '2026-11-21T10:00:00Z' };
  players = [
    { id: 'p1', player_name: 'Me', player_index: 0, session_id: 'me', is_bot: false, scores: {} },
    { id: 'p2', player_name: 'Other', player_index: 1, session_id: 'other', is_bot: false, scores: {} },
  ];
  m.rpc.mockReset().mockImplementation(async (name: string) => reply(name === 'validate_game_session' ? { valid: true, player_index: ownIndex } : true));
  m.from.mockReset().mockImplementation((table: string) => {
    let columns = '*';
    const q = { select: (c: string) => { columns = c; return q; }, eq: () => q,
      order: () => Promise.resolve(reply(players.map(p => ({ ...p, scores: { ...p.scores } })))),
      single: () => {
        gameReadCount++;
        const snapshot = reply({ ...game });
        return columns !== '*' && slowLockReadMs ? new Promise(r => setTimeout(() => r(snapshot), slowLockReadMs)) : Promise.resolve(snapshot);
      },
      maybeSingle: () => {
        checkCount++;
        const snapshot = reply({ ...players[0], scores: { ...players[0]?.scores } });
        return slowCheckMs ? new Promise(r => setTimeout(() => r(snapshot), slowCheckMs)) : Promise.resolve(snapshot);
      },
    };
    return q;
  });
  m.direct.mockReset();
  vi.mocked(trackEvent).mockClear();
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });
async function joined() {
  const hook = renderHook(() => useMultiplayerGame());
  await act(async () => { await hook.result.current.rejoinGame('game'); });
  return hook;
}
function commitScore(score = 50) {
  const owner = players[0];
  if (owner) owner.scores = { yatzy: score };
  game = { ...game, current_player_index: 1, rolls_left: 3, updated_at: '2026-11-21T10:01:00Z' };
}
describe('one owned late confirmation, without resending', () => {
  it.each([6000, 12600, 16000])('accepts a score receipt at %i ms despite a slow fallback', async ms => {
    const hook = await joined(); slowCheckMs = 5000;
    m.direct.mockImplementation(() => new Promise(r => setTimeout(() => { commitScore(); r(reply({ success: true, score: 50 })); }, ms)));
    await act(async () => { void hook.result.current.selectCategory('yatzy'); await vi.advanceTimersByTimeAsync(ms); });
    expect(hook.result.current.pendingCategory).toBeNull();
    expect(hook.result.current.gameState?.players[0]?.scores.yatzy).toBe(50);
    expect(hook.result.current.gameState?.currentPlayerIndex).toBe(1);
    expect(hook.result.current.error).toBeNull();
    expect(m.direct).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(vi.mocked(trackEvent).mock.calls.filter(([event, meta]) => event === 'mp_issue' && (meta as {kind?: string}).kind === 'submit_slow')).toHaveLength(1);
    expect(m.direct).toHaveBeenCalledTimes(1);
    hook.unmount();
  });
  it.each([6000, 12600, 16000])('accepts a lock receipt at %i ms without losing its exact locks', async ms => {
    const hook = await joined(); slowLockReadMs = 5000;
    m.direct.mockImplementation((_name: string, _fallback: string, args: { p_locked: boolean[] }) => new Promise(r => setTimeout(() => {
      game = { ...game, locked_dice: [...args.p_locked], updated_at: '2026-11-21T10:01:00Z' };
      r(reply({ success: true }));
    }, ms)));
    await act(async () => { hook.result.current.toggleLock(0); await vi.advanceTimersByTimeAsync(250 + ms); });
    expect(hook.result.current.locksPending).toBe(false);
    expect(hook.result.current.gameState?.lockedDice).toEqual([true,false,false,false,false]);
    expect(m.direct).toHaveBeenCalledTimes(1);
    hook.unmount();
  });
  it('a fallback wins once and the late score receipt cannot affect the next turn', async () => {
    const hook = await joined();
    let release: (value: unknown) => void = () => {};
    m.direct.mockImplementation(() => new Promise(r => { release = r; }));
    await act(async () => { void hook.result.current.selectCategory('yatzy'); await vi.advanceTimersByTimeAsync(1000); commitScore(); await vi.advanceTimersByTimeAsync(3000); });
    expect(hook.result.current.pendingCategory).toBeNull();
    const reads = gameReadCount;
    await act(async () => { release(reply({ success: true, score: 0 })); });
    expect(hook.result.current.gameState?.players[0]?.scores.yatzy).toBe(50);
    expect(hook.result.current.gameState?.currentPlayerIndex).toBe(1);
    expect(gameReadCount).toBe(reads);
    expect(m.direct).toHaveBeenCalledTimes(1);
    hook.unmount();
  });
  it('a lock fallback wins while the real request still owns the mutation queue', async () => {
    const hook = await joined();
    let release: (value: unknown) => void = () => {};
    m.direct.mockImplementationOnce(() => new Promise(r => { release = r; })).mockResolvedValue(reply({ success: true }));
    await act(async () => { hook.result.current.toggleLock(0); await vi.advanceTimersByTimeAsync(250); game = { ...game, locked_dice: [true,false,false,false,false] }; await vi.advanceTimersByTimeAsync(12000); });
    expect(hook.result.current.locksPending).toBe(false);
    await act(async () => { hook.result.current.toggleLock(1); await vi.advanceTimersByTimeAsync(250); });
    expect(m.direct).toHaveBeenCalledTimes(1);
    await act(async () => { release(reply({ success: true })); });
    expect(m.direct).toHaveBeenCalledTimes(2);
    expect(m.direct.mock.calls[1]?.[2].p_locked).toEqual([true,true,false,false,false]);
    hook.unmount();
  });
  it.each(['score', 'lock'])('drops a late %s receipt after leaving and reopening the same match', async kind => {
    const hook = await joined();
    let release: (value: unknown) => void = () => {};
    m.direct.mockImplementation(() => new Promise(r => { release = r; }));
    await act(async () => { if (kind === 'score') void hook.result.current.selectCategory('yatzy'); else hook.result.current.toggleLock(0); await vi.advanceTimersByTimeAsync(13000); });
    game = { ...game, id: 'other', round: 2 };
    await act(async () => { await hook.result.current.rejoinGame('other'); });
    game = { ...game, id: 'game', round: 3, locked_dice: [false,true,false,false,false] };
    await act(async () => { await hook.result.current.rejoinGame('game'); release(reply({ success: true, score: 50 })); });
    expect(hook.result.current.gameState?.round).toBe(3);
    expect(hook.result.current.gameState?.lockedDice).toEqual([false,true,false,false,false]);
    expect(hook.result.current.gameState?.players[0]?.scores.yatzy).toBeUndefined();
    expect(hook.result.current.pendingCategory).toBeNull();
    expect(hook.result.current.locksPending).toBe(false);
    expect(m.direct).toHaveBeenCalledTimes(1);
    hook.unmount();
  });
  it.each(['score', 'lock'])('keeps a dispatched %s receipt valid across same-match reconnect', async kind => {
    const hook = await joined();
    let release: (value: unknown) => void = () => {};
    m.direct.mockImplementation(() => new Promise(r => { release = r; }));
    await act(async () => { if (kind === 'score') void hook.result.current.selectCategory('yatzy'); else hook.result.current.toggleLock(0); await vi.advanceTimersByTimeAsync(13000); });
    await act(async () => { await hook.result.current.rejoinGame('game'); });
    await act(async () => {
      if (kind === 'score') commitScore(); else game = { ...game, locked_dice: [true,false,false,false,false] };
      release(reply({ success: true, score: 50 }));
    });
    expect(hook.result.current.pendingCategory).toBeNull();
    expect(hook.result.current.locksPending).toBe(false);
    if (kind === 'score') expect(hook.result.current.gameState?.players[0]?.scores.yatzy).toBe(50);
    else expect(hook.result.current.gameState?.lockedDice).toEqual([true,false,false,false,false]);
    expect(m.direct).toHaveBeenCalledTimes(1);
    hook.unmount();
  });
  it('stale fallback started before reconnect cannot confirm a score', async () => {
    const hook = await joined(); slowCheckMs = 3000;
    const owner = players[0];
    if (owner) owner.scores = { yatzy: 50 };
    m.direct.mockImplementation(() => new Promise(() => {}));
    await act(async () => { void hook.result.current.selectCategory('yatzy'); await vi.advanceTimersByTimeAsync(4000); });
    if (owner) owner.scores = {};
    await act(async () => { await hook.result.current.rejoinGame('game'); await vi.advanceTimersByTimeAsync(3000); });
    expect(hook.result.current.pendingCategory).toBe('yatzy');
    expect(checkCount).toBe(1);
    expect(m.direct).toHaveBeenCalledTimes(1);
    hook.unmount();
  });
  it('timeout with unknown state keeps scoring blocked and does not resend', async () => {
    const hook = await joined(); m.direct.mockImplementation(() => new Promise(() => {}));
    await act(async () => { void hook.result.current.selectCategory('yatzy'); await vi.advanceTimersByTimeAsync(16000); await hook.result.current.selectCategory('ones'); await hook.result.current.roll(); });
    expect(hook.result.current.pendingCategory).toBe('yatzy');
    expect(m.direct).toHaveBeenCalledTimes(1);
    await act(async () => { commitScore(); await hook.result.current.retryConnection(); });
    expect(hook.result.current.pendingCategory).toBeNull();
    expect(hook.result.current.gameState?.currentPlayerIndex).toBe(1);
    hook.unmount();
  });
  it.each(['score', 'lock'])('a late %s receipt never changes another validated player seat', async kind => {
    const hook = await joined();
    let release: (value: unknown) => void = () => {};
    m.direct.mockImplementation(() => new Promise(r => { release = r; }));
    await act(async () => { if (kind === 'score') void hook.result.current.selectCategory('yatzy'); else hook.result.current.toggleLock(0); await vi.advanceTimersByTimeAsync(13000); });
    ownIndex = 1;
    await act(async () => { await hook.result.current.rejoinGame('game'); release(reply({ success: true, score: 50 })); });
    expect(hook.result.current.myPlayerIndex).toBe(1);
    expect(hook.result.current.gameState?.players[1]?.scores.yatzy).toBeUndefined();
    expect(hook.result.current.pendingCategory).toBeNull();
    expect(m.direct).toHaveBeenCalledTimes(1);
    hook.unmount();
  });
  it('an old lock receipt cannot restore locks after a newer roll is read on reconnect', async () => {
    const hook = await joined();
    let release: (value: unknown) => void = () => {};
    m.direct.mockImplementation(() => new Promise(r => { release = r; }));
    await act(async () => { hook.result.current.toggleLock(0); await vi.advanceTimersByTimeAsync(13000); });
    game = { ...game, rolls_left: 1, dice: [1,2,3,4,5], locked_dice: [false,true,false,false,false], updated_at: '2026-11-21T10:02:00Z' };
    await act(async () => { await hook.result.current.rejoinGame('game'); release(reply({ success: true })); });
    expect(hook.result.current.gameState?.rollsLeft).toBe(1);
    expect(hook.result.current.gameState?.dice).toEqual([1,2,3,4,5]);
    // A previous-roll optimistic lock must not survive into this new roll.
    expect(hook.result.current.gameState?.lockedDice).toEqual([false,true,false,false,false]);
    expect(hook.result.current.locksPending).toBe(false);
    expect(m.direct).toHaveBeenCalledTimes(1);
    hook.unmount();
  });
  it('a late first lock receipt never overwrites a newer tapped full batch', async () => {
    const hook = await joined();
    let release: (value: unknown) => void = () => {};
    m.direct.mockImplementationOnce(() => new Promise(r => { release = r; })).mockResolvedValue(reply({ success: true }));
    await act(async () => { hook.result.current.toggleLock(0); await vi.advanceTimersByTimeAsync(250); hook.result.current.toggleLock(1); await vi.advanceTimersByTimeAsync(16000); });
    expect(m.direct).toHaveBeenCalledTimes(1);
    await act(async () => { release(reply({ success: true })); });
    expect(hook.result.current.gameState?.lockedDice).toEqual([true,true,false,false,false]);
    expect(m.direct).toHaveBeenCalledTimes(2);
    expect(m.direct.mock.calls[1]?.[2].p_locked).toEqual([true,true,false,false,false]);
    hook.unmount();
  });
  it('a lock read from before reconnect cannot confirm its old snapshot', async () => {
    const hook = await joined(); slowLockReadMs = 3000;
    m.direct.mockImplementation(() => new Promise(() => {}));
    await act(async () => { hook.result.current.toggleLock(0); await vi.advanceTimersByTimeAsync(250); game = { ...game, locked_dice: [true,false,false,false,false] }; await vi.advanceTimersByTimeAsync(12000); });
    game = { ...game, locked_dice: [false,false,false,false,false] };
    await act(async () => { await hook.result.current.rejoinGame('game'); await vi.advanceTimersByTimeAsync(3000); });
    expect(hook.result.current.locksPending).toBe(true);
    expect(m.direct).toHaveBeenCalledTimes(1);
    hook.unmount();
  });
  it('a fallback can confirm zero points, but never another player’s points', async () => {
    const hook = await joined();
    m.direct.mockImplementation(() => new Promise(() => {}));
    const other = players[1];
    if (other) other.scores = { yatzy: 50 };
    await act(async () => { void hook.result.current.selectCategory('yatzy'); await vi.advanceTimersByTimeAsync(4000); });
    expect(hook.result.current.pendingCategory).toBe('yatzy');
    await act(async () => { commitScore(0); await hook.result.current.retryConnection(); });
    expect(hook.result.current.pendingCategory).toBeNull();
    expect(hook.result.current.gameState?.players[0]?.scores.yatzy).toBe(0);
    expect(m.direct).toHaveBeenCalledTimes(1);
    hook.unmount();
  });
  it.each(['score', 'lock'])('unmount cancels a late %s callback and its confirmation timers', async kind => {
    const hook = await joined();
    let release: (value: unknown) => void = () => {};
    m.direct.mockImplementation(() => new Promise(r => { release = r; }));
    await act(async () => { if (kind === 'score') void hook.result.current.selectCategory('yatzy'); else hook.result.current.toggleLock(0); await vi.advanceTimersByTimeAsync(250); });
    hook.unmount();
    const reads = gameReadCount;
    await act(async () => { release(reply({ success: true, score: 50 })); await vi.advanceTimersByTimeAsync(16000); });
    expect(gameReadCount).toBe(reads);
    expect(m.direct).toHaveBeenCalledTimes(1);
  });
});