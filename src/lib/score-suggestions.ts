/** The page hides other suggestions while rolling or awaiting a score receipt. */
export function canShowOnlineScoreSuggestions(state: {
  isMyTurn: boolean;
  localRolling: boolean;
  remoteRolling: boolean;
  rollPending: boolean;
  gameRolling: boolean;
  pendingCategory: string | null;
  placementAwaitingTurn?: boolean;
}): boolean {
  return state.isMyTurn && !state.localRolling && !state.remoteRolling && !state.rollPending
    && !state.gameRolling && state.pendingCategory === null && !state.placementAwaitingTurn;
}

/** A saved placement still belongs to the old turn until the next turn/roll is read. */
export function isScorePlacementAwaitingTurn(placement: string | null, currentPlayerIndex: number, rollsLeft: number): boolean {
  return rollsLeft < 3 && !!placement?.startsWith(`${currentPlayerIndex}:`);
}

export interface ScorePresentationHold {
  gameId: string;
  playerIndex: number;
  round: number;
  category: string;
}

/** Owned by the page, not the rotating board. No mutation/confirmation authority. */
export function reconcileScorePresentationHold(previous: ScorePresentationHold | null, snapshot: {
  gameId: string | null;
  playerIndex: number;
  round: number;
  rollsLeft: number;
  scores: Partial<Record<string, number | null>>;
  pendingCategory: string | null;
  pendingPlayerIndex: number | null;
}): ScorePresentationHold | null {
  if (!snapshot.gameId || snapshot.rollsLeft === 3) return null;
  if (snapshot.pendingCategory && snapshot.pendingPlayerIndex === snapshot.playerIndex) {
    return { gameId: snapshot.gameId, playerIndex: snapshot.playerIndex, round: snapshot.round, category: snapshot.pendingCategory };
  }
  if (!previous || previous.gameId !== snapshot.gameId || previous.playerIndex !== snapshot.playerIndex
      || previous.round !== snapshot.round || snapshot.scores[previous.category] == null) return null;
  return previous;
}