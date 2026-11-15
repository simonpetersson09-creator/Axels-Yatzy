import { describe, expect, it } from 'vitest';
import { getDiceAreaPrompt, type DiceAreaPromptInput } from './dice-area-prompt';

const base: DiceAreaPromptInput = {
  isMyTurn: true,
  tableEmpty: true,
  rollsLeft: 3,
  rolling: false,
  gameOver: false,
  waitingTextShown: false,
};

const prompt = (over: Partial<DiceAreaPromptInput>) => getDiceAreaPrompt({ ...base, ...over });

describe('dice area prompt', () => {
  it('asks the player to start when the table is empty on their own turn', () => {
    expect(prompt({})).toBe('start');
  });

  it('never shows the start prompt and the wait notice at the same time', () => {
    expect(prompt({ waitingTextShown: true })).toBeNull();
    expect(prompt({ isMyTurn: false, waitingTextShown: true })).toBe('waiting');
    expect(prompt({ isMyTurn: false, waitingTextShown: false })).toBeNull();
  });

  it('stays silent once the player has thrown, while a throw runs, or after the match', () => {
    expect(prompt({ rollsLeft: 2 })).toBeNull();
    expect(prompt({ rollsLeft: 1 })).toBeNull();
    expect(prompt({ rolling: true })).toBeNull();
    expect(prompt({ gameOver: true })).toBeNull();
    expect(prompt({ tableEmpty: false })).toBeNull();
  });

  it('still names the wait notice as the only text on the opponent’s turn', () => {
    expect(prompt({ isMyTurn: false, waitingTextShown: true, rollsLeft: 3 })).toBe('waiting');
    expect(prompt({ isMyTurn: false, waitingTextShown: true, rollsLeft: 2 })).toBeNull();
  });
});
