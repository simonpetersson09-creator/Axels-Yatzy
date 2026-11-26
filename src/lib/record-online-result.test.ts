import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/finished-event', () => ({ trackFinishedEvent: vi.fn() }));
import { recordFinishedOnlineResult } from './record-online-result';
import { getLocalStats } from './local-stats';

const players = [{ session_id: 'me', score: 250, yatzy: true }, { session_id: 'op', score: 200, yatzy: false }];
beforeEach(() => localStorage.clear());
describe('match finished while away', () => {
  it('counts the win once in my statistics', () => {
    expect(recordFinishedOnlineResult('g1', 'me', players, false)).toBe(true);
    expect(recordFinishedOnlineResult('g1', 'me', players, false)).toBe(false);
    const s = getLocalStats(); expect(s.gamesPlayed).toBe(1); expect(s.wins).toBe(1); expect(s.yatzyCount).toBe(1);
  });
  it('never counts a forfeited match', () => {
    expect(recordFinishedOnlineResult('g2', 'me', players, true)).toBe(false);
    expect(getLocalStats().gamesPlayed).toBe(0);
  });
});
