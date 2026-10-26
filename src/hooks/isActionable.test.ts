import { describe, expect, it } from 'vitest';
import { isActionable } from './useMultiplayerGame';

describe('online actions after match end', () => {
  it('allows actions in a running match', () => {
    expect(isActionable({ status: 'playing', gameState: { gameOver: false } })).toBe(true);
  });
  it('blocks actions once the server says the match is finished', () => {
    expect(isActionable({ status: 'finished', gameState: { gameOver: false } })).toBe(false);
  });
  it('blocks actions when the board already shows game over', () => {
    expect(isActionable({ status: 'playing', gameState: { gameOver: true } })).toBe(false);
  });
});
