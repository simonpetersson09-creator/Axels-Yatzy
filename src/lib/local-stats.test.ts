import { beforeEach, describe, expect, it } from 'vitest';
import { getLocalStats, getRankedGames, recordGameResult, resetLocalStats } from './local-stats';

beforeEach(() => {
  localStorage.clear();
  resetLocalStats();
});

describe('recordGameResult', () => {
  it('counts a fully played match as a played game', () => {
    recordGameResult(250, true, 0, 'm1');
    expect(getLocalStats().gamesPlayed).toBe(1);
    expect(getRankedGames()).toBe(1);
  });

  it('never counts a forfeit as a played game', () => {
    recordGameResult(180, false, 0, 'm2', false);
    expect(getLocalStats().gamesPlayed).toBe(0);
    expect(getRankedGames()).toBe(0);
  });

  it('counts completed and forfeited matches separately', () => {
    recordGameResult(250, true, 0, 'm3');
    recordGameResult(180, false, 0, 'm4', false);
    recordGameResult(200, false, 0, 'm5');
    expect(getLocalStats().gamesPlayed).toBe(2);
    expect(getRankedGames()).toBe(2);
  });
});
