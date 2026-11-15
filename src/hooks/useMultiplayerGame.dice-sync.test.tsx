import { act, renderHook } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), action: vi.fn(), roll: vi.fn(), track: vi.fn(), handlers: {} as Record<string, (msg: unknown) => void> }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  rpc: m.rpc, from: m.from, removeChannel: vi.fn(),
  channel: () => {
    const c = {
      on: (type: string, filter: { event?: string; table?: string }, cb: (msg: unknown) => void) => { if (filter?.event) m.handlers[type === 'postgres_changes' ? String(filter.table) : filter.event] = cb; return c; },
      subscribe: () => c, send: vi.fn(),
    };
    return c;
  },
} }));
vi.mock('@/lib/session', () => ({ getSessionId: () => 'me', requireClaimedDevice: async () => 'device' }));
vi.mock('@/lib/multiplayer-actions', () => ({ directRpc: m.roll, invokeDeviceAction: m.action }));
vi.mock('@/lib/i18n', () => ({ t: (key: string) => key }));
vi.mock('@/lib/analytics', () => ({ trackEvent: m.track }));
vi.mock('@/lib/notifications', () => ({ clearGameNotifications: vi.fn() }));
import { useMultiplayerGame, resetDiceIssueCounts } from './useMultiplayerGame';
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
  resetDiceIssueCounts(); vi.useFakeTimers(); holdReads = false; held = [];
  m.track.mockClear(); m.handlers = {}; players[0].scores = {}; players[1].scores = {};
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
  it('lands a remote roll from a full read when both result notifications are lost', async () => {
    game = { ...game, current_player_index: 1, rolls_left: 2 };
    const { result, unmount } = await joined();
    await act(async () => { m.handlers.roll_started({ payload: { player: 1, lockedDice: [true,false,false,false,false], rollsLeft: 1 } }); });
    game = { ...game, rolls_left: 1, dice: [2,6,6,6,6], locked_dice: [true,false,false,false,false], updated_at: '2026-11-15T12:00:01Z' };
    await act(async () => { await result.current.retryConnection(); });
    expect(diceAwait.active).toBe(false);
    expect(result.current.gameState?.dice).toEqual([2,6,6,6,6]);
    expect(result.current.gameState?.lockedDice).toEqual([true,false,false,false,false]);
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(result.current.remoteRolling).toBe(false);
    unmount();
  });

  it('rejects an earlier result during the next remote throw', async () => {
    game = { ...game, current_player_index: 1, rolls_left: 2 };
    const { result, unmount } = await joined();
    await act(async () => { m.handlers.roll_started({ payload: { player: 1, lockedDice: [true,false,false,false,false], rollsLeft: 1 } }); });
    await act(async () => { m.handlers.roll_result({ payload: { player: 1, dice: [2,3,4,5,6], lockedDice: [false,false,false,false,false], rollsLeft: 2 } }); });
    expect(diceAwait.active).toBe(true);
    expect(result.current.gameState?.rollsLeft).toBe(1);
    expect(result.current.gameState?.lockedDice).toEqual([true,false,false,false,false]);
    await act(async () => { m.handlers.roll_result({ payload: { player: 1, dice: [2,6,6,6,6], lockedDice: [true,false,false,false,false], rollsLeft: 1 } }); });
    expect(diceAwait.active).toBe(false);
    expect(result.current.gameState?.dice).toEqual([2,6,6,6,6]);
    unmount();
  });

  it('lands from the saved server roll when roll_result is lost after a lock hint', async () => {
    game = { ...game, current_player_index: 1, rolls_left: 2 };
    const { result, unmount } = await joined();
    await act(async () => { m.handlers.roll_started({ payload: { player: 1, lockedDice: [true,false,false,false,false], rollsLeft: 1 } }); });
    await act(async () => { m.handlers.games({ new: { ...game, rolls_left: 1, dice: [2,6,6,6,6], locked_dice: [true,false,false,false,false], updated_at: '2026-11-15T12:00:01Z' } }); });
    expect(diceAwait.active).toBe(false);
    expect(result.current.gameState?.dice).toEqual([2,6,6,6,6]);
    unmount();
  });

  it('does not start a second flight for a delayed duplicate roll_started', async () => {
    game = { ...game, current_player_index: 1, rolls_left: 1 };
    const { result, unmount } = await joined();
    await act(async () => { m.handlers.roll_started({ payload: { player: 1, lockedDice: [true,false,false,false,false], rollsLeft: 1 } }); });
    expect(result.current.remoteRolling).toBe(false);
    expect(diceAwait.active).toBe(false);
    unmount();
  });

  it('clears value-less tumbling when the opponent scores before their result arrives', async () => {
    game = { ...game, current_player_index: 1, rolls_left: 2 };
    const { result, unmount } = await joined();
    await act(async () => { m.handlers.roll_started({ payload: { player: 1, lockedDice: [true,false,false,false,false], rollsLeft: 1 } }); });
    await act(async () => { m.handlers.games({ new: { ...game, current_player_index: 0, round: 2, rolls_left: 3, updated_at: '2026-11-15T12:00:01Z' } }); });
    expect(result.current.gameState?.currentPlayerIndex).toBe(0);
    expect(result.current.remoteRolling).toBe(false);
    expect(diceAwait.active).toBe(false);
    unmount();
  });
  it('ignores an older turn notification before it can move or reset dice', async () => {
    game = { ...game, rolls_left: 1, locked_dice: [true,false,true,false,false] };
    const { result, unmount } = await joined();
    await act(async () => { m.handlers.games({ new: { ...game, current_player_index: 1, rolls_left: 3, updated_at: '2026-11-15T11:59:59Z' } }); });
    expect(result.current.gameState?.currentPlayerIndex).toBe(0);
    expect(result.current.gameState?.lockedDice).toEqual([true,false,true,false,false]);
    expect(m.track).toHaveBeenCalledWith('mp_issue', expect.objectContaining({ kind: 'turn_change_blocked', reason: 'stale_snapshot' }), expect.anything());
    unmount();
  });

  it('rejects an unconfirmed handoff from both realtime and its follow-up read', async () => {
    game = { ...game, rolls_left: 1 };
    const { result, unmount } = await joined();
    game = { ...game, current_player_index: 1, rolls_left: 3, updated_at: '2026-11-15T12:00:01Z' };
    await act(async () => { m.handlers.games({ new: game }); await vi.advanceTimersByTimeAsync(200); });
    expect(result.current.gameState?.currentPlayerIndex).toBe(0);
    expect(result.current.gameState?.rollsLeft).toBe(1);
    expect(m.track).toHaveBeenCalledWith('mp_issue', expect.objectContaining({ source: 'refresh', reason: 'score_unconfirmed' }), expect.anything());
    unmount();
  });

  it('keeps own held dice and turn until the score answer confirms the handoff', async () => {
    game = { ...game, rolls_left: 1, dice: [4,4,4,2,1], locked_dice: [true,true,true,false,false] };
    const { result, unmount } = await joined();
    let release: (value: unknown) => void = () => {};
    m.roll.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    await act(async () => { await result.current.selectCategory('fours'); });
    expect(result.current.gameState?.currentPlayerIndex).toBe(0);
    expect(result.current.gameState?.lockedDice).toEqual([true,true,true,false,false]);
    expect(result.current.gameState?.players[0].scores.fours).toBe(12);
    game = { ...game, current_player_index: 1, rolls_left: 3, updated_at: '2026-11-15T12:00:01Z' };
    await act(async () => { m.handlers.games({ new: game }); await vi.advanceTimersByTimeAsync(200); });
    expect(result.current.gameState?.currentPlayerIndex).toBe(0);
    await act(async () => { release({ data: { success: true, score: 12 }, error: null }); });
    expect(result.current.gameState?.currentPlayerIndex).toBe(1);
    expect(result.current.gameState?.rollsLeft).toBe(3);
    unmount();
  });

  it('logs an ignored old-round throw at most twice per match', async () => {
    game = { ...game, current_player_index: 1, rolls_left: 3, round: 2 };
    const { unmount } = await joined();
    for (let i = 0; i < 4; i++) {
      await act(async () => { m.handlers.roll_started({ payload: { player: 1, lockedDice: [false,false,false,false,false], rollsLeft: 2, round: 1 } }); });
    }
    const logged = m.track.mock.calls.filter(c => c[0] === 'mp_issue' && c[1]?.kind === 'dice_msg_ignored' && c[1]?.reason === 'old_round');
    expect(logged).toHaveLength(2);
    unmount();
  });

  it('accepts a full read that proves a missed own score was committed', async () => {
    game = { ...game, rolls_left: 1 };
    const { result, unmount } = await joined();
    players[0].scores = { fours: 12 };
    game = { ...game, current_player_index: 1, rolls_left: 3, updated_at: '2026-11-15T12:00:01Z' };
    await act(async () => { m.handlers.games({ new: game }); await vi.advanceTimersByTimeAsync(200); });
    expect(result.current.gameState?.currentPlayerIndex).toBe(1);
    expect(result.current.gameState?.players[0].scores.fours).toBe(12);
    unmount();
  });

  it('applies a current opponent handoff and rejects their delayed roll broadcasts on my turn', async () => {
    game = { ...game, current_player_index: 1, rolls_left: 1 };
    const { result, unmount } = await joined();
    await act(async () => { m.handlers.games({ new: { ...game, current_player_index: 0, round: 2, rolls_left: 3, updated_at: '2026-11-15T12:00:01Z' } }); });
    expect(result.current.gameState?.currentPlayerIndex).toBe(0);
    expect(result.current.gameState?.round).toBe(2);
    await act(async () => {
      m.handlers.roll_started({ payload: { player: 1, lockedDice: [true,false,true,false,false], rollsLeft: 0 } });
      m.handlers.roll_result({ payload: { player: 1, dice: [6,6,6,6,6], lockedDice: [true,false,true,false,false], rollsLeft: 0 } });
    });
    expect(result.current.remoteRolling).toBe(false);
    expect(result.current.gameState?.rollsLeft).toBe(3);
    unmount();
  });
  it('plays a second opponent throw that arrives while the first is still landing', async () => {
    game = { ...game, current_player_index: 1, rolls_left: 3 };
    const { result, unmount } = await joined();
    await act(async () => { m.handlers.roll_started({ payload: { player: 1, lockedDice: [false,false,false,false,false], rollsLeft: 2, round: 1 } }); });
    await act(async () => { m.handlers.roll_result({ payload: { player: 1, dice: [1,1,2,3,4], lockedDice: [false,false,false,false,false], rollsLeft: 2, round: 1 } }); });
    await act(async () => { m.handlers.roll_started({ payload: { player: 1, lockedDice: [true,true,false,false,false], rollsLeft: 1, round: 1 } }); });
    await act(async () => { m.handlers.roll_result({ payload: { player: 1, dice: [1,1,1,1,5], lockedDice: [true,true,false,false,false], rollsLeft: 1, round: 1 } }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(result.current.gameState?.dice).toEqual([1,1,1,1,5]);
    expect(result.current.gameState?.lockedDice).toEqual([true,true,false,false,false]);
    expect(result.current.gameState?.rollsLeft).toBe(1);
    expect(result.current.remoteRolling).toBe(false);
    expect(diceAwait.active).toBe(false);
    unmount();
  });

  it('never sends a batched lock tap after leaving the match', async () => {
    game = { ...game, rolls_left: 2 };
    const { result, unmount } = await joined();
    m.action.mockClear(); m.roll.mockClear();
    act(() => { result.current.toggleLock(0); });
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(m.action).not.toHaveBeenCalled();
    expect(m.roll).not.toHaveBeenCalled();
  });

  it('drops a queued opponent throw when they score before it is replayed', async () => {
    game = { ...game, current_player_index: 1, rolls_left: 3 };
    const { result, unmount } = await joined();
    await act(async () => { m.handlers.roll_started({ payload: { player: 1, lockedDice: [false,false,false,false,false], rollsLeft: 2, round: 1 } }); });
    await act(async () => { m.handlers.roll_result({ payload: { player: 1, dice: [1,1,2,3,4], lockedDice: [false,false,false,false,false], rollsLeft: 2, round: 1 } }); });
    await act(async () => { m.handlers.roll_started({ payload: { player: 1, lockedDice: [true,true,false,false,false], rollsLeft: 1, round: 1 } }); });
    await act(async () => { m.handlers.games({ new: { ...game, current_player_index: 1, round: 2, rolls_left: 3, dice: [1,1,1,1,1], locked_dice: [false,false,false,false,false], updated_at: '2026-11-15T12:00:01Z' } }); });
    await act(async () => { m.handlers.roll_started({ payload: { player: 1, lockedDice: [false,false,false,false,false], rollsLeft: 2, round: 2 } }); });
    await act(async () => { m.handlers.roll_result({ payload: { player: 1, dice: [6,5,4,3,2], lockedDice: [false,false,false,false,false], rollsLeft: 2, round: 2 } }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(result.current.gameState?.dice).toEqual([6,5,4,3,2]);
    expect(result.current.gameState?.rollsLeft).toBe(2);
    expect(result.current.remoteRolling).toBe(false);
    unmount();
  });

  it('opens a different match from the same view', async () => {
    const { result, unmount } = await joined();
    game = { ...game, id: 'game2', game_code: 'GHIJKL' };
    await act(async () => { await result.current.rejoinGame('game2'); });
    expect(result.current.gameId).toBe('game2');
    unmount();
  });

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
