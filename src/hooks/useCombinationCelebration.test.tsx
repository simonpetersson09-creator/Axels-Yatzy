import { act, renderHook, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useCombinationCelebration } from './useCombinationCelebration';
import type { GameState } from '@/types/yatzy';

afterEach(() => { cleanup(); vi.useRealTimers(); });
const state: GameState = {
  players: [{ id: 'one', name: 'Anna', scores: {} }], currentPlayerIndex: 0,
  dice: [3, 3, 3, 2, 1], lockedDice: [false, false, false, false, false],
  rollsLeft: 2, isRolling: false, gameOver: false, round: 1,
};
it('clears a landed medal as soon as the next roll starts, including a non-winning next roll', () => {
  vi.useFakeTimers();
  const { result, rerender } = renderHook(gs => useCombinationCelebration(gs), { initialProps: state });
  act(() => window.dispatchEvent(new Event('dice:landed')));
  expect(result.current.activeCelebration).toBe('threeOfAKind');
  rerender({ ...state, isRolling: true });
  expect(result.current.activeCelebration).toBeNull();
  act(() => window.dispatchEvent(new Event('dice:landed')));
  expect(result.current.activeCelebration).toBeNull();
  rerender({ ...state, rollsLeft: 1, dice: [1, 2, 3, 4, 6] });
  act(() => window.dispatchEvent(new Event('dice:landed')));
  expect(result.current.activeCelebration).toBeNull();
});
it('clears the previous medal on a new turn and still celebrates the next landed hand', () => {
  const { result, rerender } = renderHook(gs => useCombinationCelebration(gs), { initialProps: state });
  act(() => window.dispatchEvent(new Event('dice:landed')));
  expect(result.current.activeCelebration).toBe('threeOfAKind');
  rerender({ ...state, round: 2, rollsLeft: 3 });
  expect(result.current.activeCelebration).toBeNull();
  rerender({ ...state, round: 2, dice: [4, 4, 4, 4, 2] });
  act(() => window.dispatchEvent(new Event('dice:landed')));
  expect(result.current.activeCelebration).toBe('fourOfAKind');
});
it('retains an early landed hand until its logical roll finishes, exactly once', () => {
  const { result, rerender } = renderHook(gs => useCombinationCelebration(gs), { initialProps: { ...state, isRolling: true } });
  act(() => window.dispatchEvent(new Event('dice:landed')));
  expect(result.current.activeCelebration).toBeNull();
  rerender(state);
  expect(result.current.activeCelebration).toBe('threeOfAKind');
  act(() => window.dispatchEvent(new Event('dice:landed')));
  expect(result.current.activeCelebration).toBe('threeOfAKind');
});
it('never uses an early landing for a different subsequent server hand', () => {
  const { result, rerender } = renderHook(gs => useCombinationCelebration(gs), { initialProps: { ...state, isRolling: true } });
  act(() => window.dispatchEvent(new Event('dice:landed')));
  rerender({ ...state, dice: [1, 2, 3, 4, 6] });
  expect(result.current.activeCelebration).toBeNull();
});
it('replays the same first Yatzy after a new game without deduplicating it as the old match', () => {
  const yatzy = { ...state, dice: [6, 6, 6, 6, 6] };
  const { result, rerender } = renderHook(gs => useCombinationCelebration(gs), { initialProps: yatzy });
  act(() => window.dispatchEvent(new Event('dice:landed')));
  expect(result.current.yatzyTrigger).toBe(1);
  rerender({ ...state, rollsLeft: 3 });
  rerender({ ...yatzy, isRolling: true });
  act(() => window.dispatchEvent(new Event('dice:landed')));
  rerender(yatzy);
  expect(result.current.yatzyTrigger).toBe(2);
});