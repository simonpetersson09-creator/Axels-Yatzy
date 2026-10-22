import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getLocalStats, getRankedGames, recordGameResult, resetLocalStats } from './local-stats';
import { getLocalMatchKey, startNextLocalMatch } from './local-match-key';

vi.mock('./country-rank', () => ({ syncCountryRank: vi.fn() }));
vi.mock('./hall-of-fame', () => ({ reportWeeklyScore: vi.fn() }));

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

  it('leaves every statistic and storage byte unchanged on a forfeit', () => {
    recordGameResult(250, true, 1, 'win');
    const before = localStorage.getItem('yatzy-player-stats');
    expect(recordGameResult(350, true, 5, 'forfeit', false)).toBe(false);
    expect(localStorage.getItem('yatzy-player-stats')).toBe(before);
    expect(getLocalStats()).toEqual({ gamesPlayed: 1, wins: 1, highScore: 250, yatzyCount: 1, currentStreak: 1, bestStreak: 1 });
  });

  it('preserves all historical totals and adds only the new completed result', () => {
    const old = { version: 2, gamesPlayed: 1715, completedGames: 1700, wins: 900, highScore: 340, yatzyCount: 200, currentStreak: 3, bestStreak: 20, recordedKeys: ['old'] };
    const raw = JSON.stringify(old);
    localStorage.setItem('yatzy-player-stats', raw);
    expect(getLocalStats().gamesPlayed).toBe(1715);
    expect(localStorage.getItem('yatzy-player-stats')).toBe(raw);
    recordGameResult(250, true, 1, 'new');
    expect(getLocalStats()).toEqual({ gamesPlayed: 1716, wins: 901, highScore: 340, yatzyCount: 201, currentStreak: 4, bestStreak: 20 });
    expect(getRankedGames()).toBe(1701);
  });

  it('counts completed non-wins but breaks the current streak, keeping the best', () => {
    recordGameResult(250, true, 0, 'win-1');
    recordGameResult(280, true, 0, 'win-2');
    recordGameResult(280, false, 0, 'draw');
    expect(getLocalStats()).toEqual({ gamesPlayed: 3, wins: 2, highScore: 280, yatzyCount: 0, currentStreak: 0, bestStreak: 2 });
    expect(Math.round(getLocalStats().wins / getLocalStats().gamesPlayed * 100)).toBe(67);
  });

  it('counts at most one scored Yatzy per completed match', () => {
    recordGameResult(250, false, 3, 'yatzy');
    expect(getLocalStats().yatzyCount).toBe(1);
  });

  it('keeps the first match protected after more than 300 later matches', () => {
    recordGameResult(250, true, 1, 'first');
    for (let i = 0; i < 301; i++) recordGameResult(200, false, 0, `later-${i}`);
    expect(recordGameResult(250, true, 1, 'first')).toBe(false);
    expect(getLocalStats().gamesPlayed).toBe(302);
    expect(getLocalStats().wins).toBe(1);
    expect(getLocalStats().yatzyCount).toBe(1);
  });

  it('retains a match identity on remount and rotates only for a replay', () => {
    const first = getLocalMatchKey('slot-a');
    recordGameResult(250, true, 1, first);
    expect(recordGameResult(250, true, 1, getLocalMatchKey('slot-a'))).toBe(false);
    const next = startNextLocalMatch('slot-a');
    expect(next).not.toBe(first);
    expect(getLocalMatchKey('slot-a')).toBe(next);
    expect(recordGameResult(260, true, 1, next)).toBe(true);
    expect(getLocalStats().gamesPlayed).toBe(2);
  });

  it('does not claim success or lose the key when persistence fails', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('full'); });
    expect(recordGameResult(250, true, 1, 'retry')).toBe(false);
    spy.mockRestore();
    expect(getLocalStats().gamesPlayed).toBe(0);
    expect(recordGameResult(250, true, 1, 'retry')).toBe(true);
    expect(getLocalStats().gamesPlayed).toBe(1);
  });
});
