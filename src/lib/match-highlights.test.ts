import { describe, it, expect } from 'vitest';
import { getMatchHighlights } from './match-highlights';

const base = { gamesPlayed: 5, wins: 2, highScore: 250, yatzyCount: 0, currentStreak: 1, bestStreak: 2 };
const up = (v: number[]) => ({ ones: v[0], twos: v[1], threes: v[2], fours: v[3], fives: v[4], sixes: v[5] });

describe('getMatchHighlights', () => {
  it('new record when beating previous best', () => {
    expect(getMatchHighlights(up([0,0,0,0,0,0]), 260, false, base)[0]).toEqual({ kind: 'newRecord', score: 260 });
  });
  it('no record on very first match', () => {
    expect(getMatchHighlights({}, 200, false, { ...base, gamesPlayed: 0 })).toEqual([]);
  });
  it('bonus got at 63+', () => {
    expect(getMatchHighlights(up([3,6,9,12,15,21]), 100, false, base)).toContainEqual({ kind: 'bonusGot', upper: 66 });
  });
  it('bonus missed by 3', () => {
    expect(getMatchHighlights(up([3,6,9,12,15,15]), 100, false, base)).toContainEqual({ kind: 'bonusMissed', missing: 3 });
  });
  it('win streak counts this win', () => {
    expect(getMatchHighlights({}, 100, true, base)).toContainEqual({ kind: 'streak', n: 2 });
  });
  it('distance to record', () => {
    expect(getMatchHighlights({}, 188, false, base)).toContainEqual({ kind: 'toRecord', n: 62 });
  });
  it('max four rows', () => {
    const s = { ...up([3,6,9,12,15,21]), yatzy: 50 };
    expect(getMatchHighlights(s, 300, true, base)).toHaveLength(4);
  });
});
