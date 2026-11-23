/** The page hides other suggestions while rolling or awaiting a score receipt. */
export function canShowOnlineScoreSuggestions(state: {
  isMyTurn: boolean;
  localRolling: boolean;
  remoteRolling: boolean;
  rollPending: boolean;
  gameRolling: boolean;
  pendingCategory: string | null;
}): boolean {
  return state.isMyTurn && !state.localRolling && !state.remoteRolling && !state.rollPending
    && !state.gameRolling && state.pendingCategory === null;
}

/** A saved placement still belongs to the old turn until the next turn/roll is read. */
export function isScorePlacementAwaitingTurn(placement: string | null, currentPlayerIndex: number, rollsLeft: number): boolean {
  return rollsLeft < 3 && !!placement?.startsWith(`${currentPlayerIndex}:`);
}