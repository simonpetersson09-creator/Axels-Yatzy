import { renderHook } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { useYatzyGame } from './useYatzyGame';
import { type GameState } from '@/types/yatzy';

const valid: GameState = {
  players: [{ id: 'p0', name: 'Me', scores: { ones: 3, yatzy: null } }],
  currentPlayerIndex: 0, dice: [1, 2, 3, 4, 5],
  lockedDice: [false, true, false, false, false],
  rollsLeft: 2, round: 1, isRolling: false, gameOver: false,
};
beforeEach(() => localStorage.clear());
it.each([
  ['fractional player index', { currentPlayerIndex: 0.5 }],
  ['fractional die', { dice: [1, 2, 3, 4, 5.5] }],
  ['out-of-range die', { dice: [0, 2, 3, 4, 5] }],
  ['non-boolean lock', { lockedDice: [false, 1, false, false, false] }],
  ['too many rolls', { rollsLeft: 4 }],
  ['fractional round', { round: 1.5 }],
  ['negative score', { players: [{ ...valid.players[0], scores: { ones: -1 } }] }],
  ['impossible score', { players: [{ ...valid.players[0], scores: { yatzy: 49 } }] }],
  ['string score', { players: [{ ...valid.players[0], scores: { ones: '3' } }] }],
  ['unknown score category', { players: [{ ...valid.players[0], scores: { fake: 5 } }] }],
  ['array scores', { players: [{ ...valid.players[0], scores: [] }] }],
  ['premature completed game', { gameOver: true }],
] as const)('rejects %s without crashing or touching another save', (_, patch) => {
  localStorage.setItem('yatzy_saved_game:bad', JSON.stringify({ ...valid, ...patch }));
  localStorage.setItem('yatzy_saved_game:good', JSON.stringify(valid));
  const game = renderHook(() => useYatzyGame('bad'));
  expect(game.result.current.gameState).toBeNull();
  expect(game.result.current.getPossibleScores()).toBeNull();
  expect(localStorage.getItem('yatzy_saved_game:bad')).toBeNull();
  expect(localStorage.getItem('yatzy_saved_game:good')).toBe(JSON.stringify(valid));
  game.unmount();
});
it('restores valid scores and clears an interrupted animation', () => {
  localStorage.setItem('yatzy_saved_game:good', JSON.stringify({ ...valid, isRolling: true }));
  const game = renderHook(() => useYatzyGame('good'));
  expect(game.result.current.gameState).toEqual(valid);
  expect(game.result.current.getPossibleScores()?.chance).toBe(15);
  game.unmount();
});