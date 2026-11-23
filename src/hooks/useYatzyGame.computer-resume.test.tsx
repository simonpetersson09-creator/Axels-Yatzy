import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useYatzyGame } from './useYatzyGame';
import { getLocalActiveGames, loadGameState, saveGameState, setActiveGame } from '@/lib/active-game';
import { writeRecoverable } from '@/lib/recoverable-storage';
import { CATEGORIES, type GameState } from '@/types/yatzy';
import { rollDice } from '@/lib/yatzy-scoring';

const native = vi.hoisted(() => ({ listener: null as null | ((event: { isActive: boolean }) => void), remove: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn(async (_name, cb) => {
  native.listener = cb;
  return { remove: native.remove };
}) } }));
vi.mock('@/lib/yatzy-scoring', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/yatzy-scoring')>(),
  rollDice: vi.fn(() => [6, 6, 6, 6, 6]),
}));
vi.mock('@/lib/yatzy-ai', () => ({
  aiDecideLocks: (dice: number[]) => dice.map(d => d === 6),
  aiPickCategory: (_dice: number[], scores: Record<string, number>) => scores.yatzy == null ? 'yatzy' : 'chance',
}));

const slot = 'computer-resume';
function saved(overrides: Partial<GameState> = {}): GameState {
  return {
    players: [{ id: 'p0', name: 'Me', scores: { ones: 3 } }, { id: 'p1', name: 'Computer', scores: {} }],
    currentPlayerIndex: 1, dice: [6, 6, 6, 6, 6], lockedDice: [false, false, false, false, false],
    rollsLeft: 2, isRolling: true, round: 1, gameOver: false, ...overrides,
  };
}
function seed(state: GameState) {
  writeRecoverable(`yatzy-ai-players:${slot}`, '[1]', true);
  saveGameState(state, slot);
}
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); vi.useFakeTimers(); vi.clearAllMocks();
  native.listener = null;
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

it('restores an interrupted computer roll without rerolling its existing Yatzy', () => {
  seed(saved());
  const { result, unmount } = renderHook(() => useYatzyGame(slot));
  expect(rollDice).not.toHaveBeenCalled();
  expect(result.current.gameState?.currentPlayerIndex).toBe(0);
  expect(result.current.gameState?.players[1].scores.yatzy).toBe(50);
  expect(result.current.gameState?.lastComputerMove).toEqual({ playerIndex: 1, category: 'yatzy', score: 50 });
  unmount();
  const reopened = renderHook(() => useYatzyGame(slot));
  expect(reopened.result.current.gameState?.lastComputerMove?.category).toBe('yatzy');
  expect(reopened.result.current.gameState?.players[1].scores).toEqual({ yatzy: 50 });
});

it('completes the computer turn on background, saves immediately and keeps the human first roll manual', () => {
  writeRecoverable(`yatzy-ai-players:${slot}`, '[1]', true);
  const { result } = renderHook(() => useYatzyGame(slot));
  act(() => { result.current.startGame(['Me', 'Computer']); result.current.roll(); });
  act(() => { vi.advanceTimersByTime(1350); result.current.selectCategory('chance'); });
  expect(result.current.gameState?.currentPlayerIndex).toBe(1);
  act(() => { window.dispatchEvent(new Event('pagehide')); });
  const state = loadGameState<GameState>(slot);
  expect(state?.players[1].scores.yatzy).toBe(50);
  expect(state?.currentPlayerIndex).toBe(0);
  expect(state?.rollsLeft).toBe(3);
  expect(state?.isRolling).toBe(false);
  act(() => { window.dispatchEvent(new Event('pageshow')); vi.advanceTimersByTime(10000); });
  expect(result.current.gameState?.players[1].scores).toEqual({ yatzy: 50 });
  expect(result.current.gameState?.lastComputerMove?.category).toBe('yatzy');
  expect(result.current.gameState?.rollsLeft).toBe(3);
  act(() => { result.current.roll(); });
  expect(result.current.gameState?.lastComputerMove).toBeUndefined();
});

it('native suspension completes a partially rolled turn and removes its listener on unmount', async () => {
  writeRecoverable(`yatzy-ai-players:${slot}`, '[1]', true);
  const { result, unmount } = renderHook(() => useYatzyGame(slot));
  await act(async () => {});
  act(() => { result.current.startGame(['Me', 'Computer']); result.current.roll(); });
  act(() => { vi.advanceTimersByTime(1350); result.current.selectCategory('chance'); result.current.roll(); });
  act(() => { native.listener?.({ isActive: false }); });
  expect(result.current.gameState?.currentPlayerIndex).toBe(0);
  expect(result.current.gameState?.players[1].scores.yatzy).toBe(50);
  act(() => { native.listener?.({ isActive: true }); vi.advanceTimersByTime(2000); });
  expect(result.current.gameState?.rollsLeft).toBe(3);
  unmount();
  expect(native.remove).toHaveBeenCalledOnce();
});

it('does not finish or change a human turn when backgrounded', () => {
  const state = saved({ currentPlayerIndex: 0, isRolling: false, rollsLeft: 1 });
  seed(state);
  const { result } = renderHook(() => useYatzyGame(slot));
  act(() => { window.dispatchEvent(new Event('pagehide')); window.dispatchEvent(new Event('pageshow')); });
  expect(result.current.gameState?.dice).toEqual(state.dice);
  expect(result.current.gameState?.rollsLeft).toBe(1);
  expect(result.current.gameState?.players).toEqual(state.players);
});

it('saves the final computer score on restoration instead of dropping the completed match', () => {
  const filled = Object.fromEntries(CATEGORIES.map(c => [c.id, 0]));
  const computerScores = { ...filled };
  delete computerScores.yatzy;
  seed(saved({ round: 15, rollsLeft: 0, players: [
    { id: 'p0', name: 'Me', scores: filled }, { id: 'p1', name: 'Computer', scores: computerScores },
  ] }));
  const { result } = renderHook(() => useYatzyGame(slot));
  expect(result.current.gameState?.gameOver).toBe(true);
  expect(loadGameState<GameState>(slot)?.players[1].scores.yatzy).toBe(50);
});

it('invalidates a delayed computer action synchronously before React renders the next turn', () => {
  writeRecoverable(`yatzy-ai-players:${slot}`, '[1]', true);
  const { result } = renderHook(() => useYatzyGame(slot));
  act(() => { result.current.startGame(['Me', 'Computer']); result.current.roll(); });
  act(() => { vi.advanceTimersByTime(1350); result.current.selectCategory('chance'); });
  const ownsTurn = result.current.ownsTurn;
  expect(ownsTurn(1, 1, 3)).toBe(true);
  act(() => {
    window.dispatchEvent(new Event('pagehide'));
    expect(ownsTurn(1, 1, 3)).toBe(false);
    expect(loadGameState<GameState>(slot)?.players[1].scores.yatzy).toBe(50);
  });
  expect(loadGameState<GameState>(slot)?.currentPlayerIndex).toBe(0);
});

it('makes the Home card ready synchronously when native background finishes the computer turn', async () => {
  writeRecoverable(`yatzy-ai-players:${slot}`, '[1]', true);
  const { result } = renderHook(() => useYatzyGame(slot));
  await act(async () => {});
  act(() => { result.current.startGame(['Me', 'Computer']); result.current.roll(); });
  act(() => { vi.advanceTimersByTime(1350); result.current.selectCategory('chance'); });
  expect(getLocalActiveGames()[0].currentPlayerIndex).toBe(1);
  act(() => {
    native.listener?.({ isActive: false });
    // This read deliberately happens before React's persistence effect.
    expect(getLocalActiveGames()[0].currentPlayerIndex).toBe(0);
  });
});

it('finishes and saves a computer turn on navigation to Home without opening the match again', () => {
  writeRecoverable(`yatzy-ai-players:${slot}`, '[1]', true);
  const { result, unmount } = renderHook(() => useYatzyGame(slot));
  act(() => { result.current.startGame(['Me', 'Computer']); result.current.roll(); });
  act(() => { vi.advanceTimersByTime(1350); result.current.selectCategory('chance'); });
  const lastRollTime = getLocalActiveGames()[0].lastRollTime;
  expect(getLocalActiveGames()[0].currentPlayerIndex).toBe(1);
  unmount();
  expect(getLocalActiveGames()[0].currentPlayerIndex).toBe(0);
  expect(getLocalActiveGames()[0].lastRollTime).toBe(lastRollTime);
  expect(loadGameState<GameState>(slot)?.lastComputerMove).toEqual({ playerIndex: 1, category: 'yatzy', score: 50 });
  vi.advanceTimersByTime(10000);
  expect(loadGameState<GameState>(slot)?.players[1].scores).toEqual({ yatzy: 50 });
  expect(loadGameState<GameState>(slot)?.rollsLeft).toBe(3);
});

it('reads the saved human turn instead of an older active-card summary after restart', () => {
  setActiveGame({ type: 'local', gameId: slot, timestamp: 100, lastRollTime: 200, currentPlayerIndex: 1 });
  saveGameState(saved({ currentPlayerIndex: 0, rollsLeft: 3, isRolling: false }), slot);
  expect(getLocalActiveGames()[0]).toMatchObject({ currentPlayerIndex: 0, timestamp: 100, lastRollTime: 200 });
});