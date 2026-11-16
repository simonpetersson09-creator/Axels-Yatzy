import { expect, it } from 'vitest';
import { readStatsView, saveStatsView, type StatsViewSnapshot } from './stats-view-cache';

const snapshot: StatsViewSnapshot = {
  rank: { country: null, world: null }, weekly: null, top: [], topMonth: [],
  yearGames: 91, hof: [], most: [], frames: {},
};
it('immediately returns the last numbers only for the same player', () => {
  const now = new Date('2026-11-16T09:00:00Z');
  saveStatsView('simon', snapshot, now);
  expect(readStatsView('simon', now)?.yearGames).toBe(91);
  expect(readStatsView('ppp', now)).toBeUndefined();
});
it('does not show last week after the Stockholm midnight boundary', () => {
  saveStatsView('simon', snapshot, new Date('2026-11-15T22:59:00Z'));
  expect(readStatsView('simon', new Date('2026-11-15T23:00:00Z'))).toBeUndefined();
});