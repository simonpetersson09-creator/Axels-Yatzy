import { expect, it } from 'vitest';
import { getMatchStandings } from './match-standings';
it('shares first place for 5–5 rather than inventing a second place', () => {
  expect(getMatchStandings([{ score: 5 }, { score: 5 }]).map(r => r.rank)).toEqual([1, 1]);
});
it('skips places occupied by tied players', () => {
  expect(getMatchStandings([{ score: 10 }, { score: 5 }, { score: 10 }, { score: 5 }]).map(r => r.rank)).toEqual([1, 1, 3, 3]);
});
it('does not award first place to ties below the winner', () => {
  expect(getMatchStandings([{ score: 10 }, { score: 5 }, { score: 5 }]).map(r => r.rank)).toEqual([1, 2, 2]);
});