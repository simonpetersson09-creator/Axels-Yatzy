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