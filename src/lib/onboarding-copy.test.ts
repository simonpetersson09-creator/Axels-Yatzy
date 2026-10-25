import { beforeEach, expect, it } from 'vitest';
import { markQuickHintDone, quickHintPending } from './onboarding-copy';
beforeEach(() => localStorage.clear());
it('offers the hint to a new player and permanently dismisses it on first tap', () => {
  expect(quickHintPending()).toBe(true);
  markQuickHintDone();
  expect(quickHintPending()).toBe(false);
});
it('does not offer a first-game hint to a player with completed matches', () => {
  localStorage.setItem('yatzy-player-stats', JSON.stringify({ version: 2, gamesPlayed: 39, completedGames: 39 }));
  expect(quickHintPending()).toBe(false);
});