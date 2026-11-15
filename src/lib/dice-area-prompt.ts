/** Which single text the dice area may show. The area never carries two. */
export type DiceAreaPrompt = 'start' | 'waiting' | null;

export interface DiceAreaPromptInput {
  /** It is the local player's turn. */
  isMyTurn: boolean;
  /** No dice are resting on the table. */
  tableEmpty: boolean;
  /** Throws left in the current turn; 3 means nothing has been thrown yet. */
  rollsLeft: number;
  /** A throw is animating or still in flight. */
  rolling: boolean;
  /** The match has ended. */
  gameOver: boolean;
  /** The delayed "Väntar på …" notice is currently on screen. */
  waitingTextShown: boolean;
}

/**
 * The dice area carries at most one text at a time: the player's own start
 * prompt while the table is still empty on their turn, or the wait notice for
 * the opponent's turn. The start prompt yields to a notice that is already up,
 * so the two can never be visible together.
 */
export function getDiceAreaPrompt(input: DiceAreaPromptInput): DiceAreaPrompt {
  if (input.gameOver || !input.tableEmpty || input.rolling || input.rollsLeft !== 3) return null;
  if (!input.isMyTurn) return input.waitingTextShown ? 'waiting' : null;
  return input.waitingTextShown ? null : 'start';
}
