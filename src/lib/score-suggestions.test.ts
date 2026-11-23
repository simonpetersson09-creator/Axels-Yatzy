import { describe, expect, it } from 'vitest';
import { canShowOnlineScoreSuggestions, isScorePlacementAwaitingTurn } from './score-suggestions';

const ready = { isMyTurn: true, localRolling: false, remoteRolling: false, rollPending: false, gameRolling: false, pendingCategory: null };

describe('online score suggestions', () => {
  it('shows other open categories after the dice have landed', () => {
    expect(canShowOnlineScoreSuggestions(ready)).toBe(true);
  });

  it('hides every other open category once a score has been chosen', () => {
    expect(canShowOnlineScoreSuggestions({ ...ready, pendingCategory: 'chance' })).toBe(false);
  });

  it('keeps choices hidden when the chosen score is saved but the old turn remains', () => {
    expect(isScorePlacementAwaitingTurn('0:chance', 0, 0)).toBe(true);
  });

  it('allows the next player to choose after their roll', () => {
    expect(isScorePlacementAwaitingTurn('0:chance', 1, 2)).toBe(false);
  });

  it('does not carry a placement gate into the next first roll', () => {
    expect(isScorePlacementAwaitingTurn('0:chance', 0, 3)).toBe(false);
  });

  it('releases the placement gate after rollback clears the placement', () => {
    expect(isScorePlacementAwaitingTurn(null, 0, 0)).toBe(false);
  });
});