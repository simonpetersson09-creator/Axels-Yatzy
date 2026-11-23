import { describe, expect, it } from 'vitest';
import { canShowOnlineScoreSuggestions, isScorePlacementAwaitingTurn, reconcileScorePresentationHold } from './score-suggestions';

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

describe('score presentation survives board rotation', () => {
  const pending = { gameId: 'match-a', playerIndex: 0, round: 5, rollsLeft: 0,
    scores: { chance: 30 }, pendingCategory: 'chance', pendingPlayerIndex: 0 };
  const hold = reconcileScorePresentationHold(null, pending);
  const confirmed = { ...pending, pendingCategory: null, pendingPlayerIndex: null };

  it('retains the chosen score through receipt and board remount while the old turn remains', () => {
    const kept = reconcileScorePresentationHold(hold, confirmed);
    expect(kept).toEqual({ gameId: 'match-a', playerIndex: 0, round: 5, category: 'chance' });
    expect(canShowOnlineScoreSuggestions({ ...ready, placementAwaitingTurn: kept !== null })).toBe(false);
  });

  it('releases only this presentation when rollback removes the chosen score', () => {
    expect(reconcileScorePresentationHold(hold, { ...confirmed, scores: {} })).toBeNull();
  });

  it('releases the presentation for the next player', () => {
    expect(reconcileScorePresentationHold(hold, { ...confirmed, playerIndex: 1 })).toBeNull();
  });

  it('never carries a hold into a different match', () => {
    expect(reconcileScorePresentationHold(hold, { ...confirmed, gameId: 'match-b' })).toBeNull();
  });

  it('never carries a hold into the same player in a later round', () => {
    expect(reconcileScorePresentationHold(hold, { ...confirmed, round: 6 })).toBeNull();
  });

  it('retains a saved zero just like a saved positive score', () => {
    expect(reconcileScorePresentationHold(hold, { ...confirmed, scores: { chance: 0 } })).toEqual(hold);
  });
});