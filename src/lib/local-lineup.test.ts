import { describe, it, expect } from 'vitest';
import { resolveLocalLineup, isRankedLocalMatch } from './local-lineup';
const ai = () => 'Bot';
describe('local lineup', () => {
  it('missing lineup gets a computer opponent', () => {
    expect(resolveLocalLineup(null, null, 'Me', ai)).toEqual({ playerNames: ['Me', 'Bot'], aiPlayers: [1] });
  });
  it('saved solo lineup is repaired to play the computer', () => {
    expect(resolveLocalLineup(['Ella'], [], 'Me', ai)).toEqual({ playerNames: ['Ella', 'Bot'], aiPlayers: [1] });
  });
  it('lost computer list makes opponents computers', () => {
    expect(resolveLocalLineup(['Me', 'A', 'B'], [], 'X', ai).aiPlayers).toEqual([1, 2]);
  });
  it('human seat 0 is never a computer', () => {
    expect(resolveLocalLineup(['Me', 'A'], [0, 1], 'X', ai).aiPlayers).toEqual([1]);
  });
  it('solo matches are not ranked', () => {
    expect(isRankedLocalMatch(1)).toBe(false);
    expect(isRankedLocalMatch(2)).toBe(true);
  });
});
