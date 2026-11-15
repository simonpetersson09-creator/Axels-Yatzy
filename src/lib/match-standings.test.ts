import { expect, it } from 'vitest';
import { getMatchStandings, getForfeitPlayerIndex } from './match-standings';
it('shares first place for 5–5 rather than inventing a second place', () => {
  expect(getMatchStandings([{ score: 5 }, { score: 5 }]).map(r => r.rank)).toEqual([1, 1]);
});
it('skips places occupied by tied players', () => {
  expect(getMatchStandings([{ score: 10 }, { score: 5 }, { score: 10 }, { score: 5 }]).map(r => r.rank)).toEqual([1, 1, 3, 3]);
});
it('does not award first place to ties below the winner', () => {
  expect(getMatchStandings([{ score: 10 }, { score: 5 }, { score: 5 }]).map(r => r.rank)).toEqual([1, 2, 2]);
});
it('identifies only the forfeiting seat when both players are named Anna', () => {
  expect(getForfeitPlayerIndex([{ name: 'Anna' }, { name: 'Anna' }], 0, 'Anna')).toBe(0);
  expect(getForfeitPlayerIndex([{ name: 'Anna' }, { name: 'Anna' }], 1, 'Anna')).toBe(1);
});
it('never guesses a forfeiting seat from ambiguous names or invalid identity', () => {
  expect(getForfeitPlayerIndex([{ name: 'Anna' }, { name: 'Anna' }], undefined, 'Anna')).toBeNull();
  expect(getForfeitPlayerIndex([{ name: 'Anna' }, { name: 'Erik' }], -1, 'Anna')).toBeNull();
  expect(getForfeitPlayerIndex([{ name: 'Anna' }, { name: 'Erik' }], undefined, 'Anna')).toBe(0);
});