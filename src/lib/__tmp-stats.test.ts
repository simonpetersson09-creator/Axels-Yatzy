import { describe, it, expect, beforeEach } from 'vitest';
import { recordGameResult, getLocalStats, resetLocalStats } from '@/lib/local-stats';
describe('stats', () => {
  beforeEach(() => { localStorage.clear(); resetLocalStats(); });
  it('counts wins', () => {
    recordGameResult(200, true, 1, 'a');
    recordGameResult(150, false, 0, 'b');
    recordGameResult(250, true, 0, 'c');
    expect(getLocalStats()).toMatchObject({ gamesPlayed: 3, wins: 2, highScore: 250, currentStreak: 1, bestStreak: 1 });
  });
});
