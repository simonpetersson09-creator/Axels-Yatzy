import { expect, it } from 'vitest';
import { forfeitAdAllowed } from './forfeit-ad';
const base = { score: 30, vsComputer: true, completedGames: 5, now: 100 * 60_000, lastForfeitAdAt: 0, lastAdShownAt: 0 };
it('allows a forfeit ad at 30 points after 5 completed matches against the computer', () => {
  expect(forfeitAdAllowed(base)).toBe(true);
});
it('no ad below 30 points', () => { expect(forfeitAdAllowed({ ...base, score: 29 })).toBe(false); });
it('no ad during the first 5 matches', () => { expect(forfeitAdAllowed({ ...base, completedGames: 4 })).toBe(false); });
it('never in online matches', () => { expect(forfeitAdAllowed({ ...base, vsComputer: false })).toBe(false); });
it('at most one forfeit ad per 10 minutes', () => {
  expect(forfeitAdAllowed({ ...base, lastForfeitAdAt: base.now - 9 * 60_000 })).toBe(false);
  expect(forfeitAdAllowed({ ...base, lastForfeitAdAt: base.now - 10 * 60_000 })).toBe(true);
});
it('no ad within 3 minutes of another full-screen ad', () => {
  expect(forfeitAdAllowed({ ...base, lastAdShownAt: base.now - 2 * 60_000 })).toBe(false);
  expect(forfeitAdAllowed({ ...base, lastAdShownAt: base.now - 3 * 60_000 })).toBe(true);
});
