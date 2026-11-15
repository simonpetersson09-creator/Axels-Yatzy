import { describe, expect, it } from 'vitest';
import { getTotalScore, getUpperBonusDifference, isUpperBonusSecured } from './yatzy-scoring';

describe('running upper bonus difference', () => {
  it('starts at zero and ignores unfilled categories', () => {
    expect(getUpperBonusDifference({ ones: null })).toBe(0);
  });

  it('shows +3 for four threes against the three-of-each target', () => {
    expect(getUpperBonusDifference({ threes: 12 })).toBe(3);
  });

  it('shows -3 for two threes', () => {
    expect(getUpperBonusDifference({ threes: 6 })).toBe(-3);
  });

  it('counts a crossed-out category as a deficit', () => {
    expect(getUpperBonusDifference({ sixes: 0 })).toBe(-18);
  });

  it('combines only filled upper categories independently per player', () => {
    expect(getUpperBonusDifference({ ones: 0, threes: 15, chance: 30 })).toBe(3);
    expect(getUpperBonusDifference({ ones: 3, threes: 6, yatzy: 50 })).toBe(-3);
  });

  it('does not change the actual 63-point threshold or 50-point bonus', () => {
    const scores = { ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 };
    expect(getUpperBonusDifference(scores)).toBe(0);
    expect(getTotalScore(scores)).toBe(113);
    expect(getTotalScore({ ...scores, sixes: 12 })).toBe(57);
  });

  it('secures the bonus only at 63+ with the full upper section filled', () => {
    const exact = { ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 };
    expect(isUpperBonusSecured(exact)).toBe(true);
    expect(isUpperBonusSecured({ ...exact, sixes: 17 })).toBe(false);
    expect(isUpperBonusSecured({ ones: 5, twos: 10, threes: 15, fours: 20, sixes: null })).toBe(false);
  });
});