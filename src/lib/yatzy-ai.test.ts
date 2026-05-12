import { describe, it, expect } from 'vitest';
import { aiPickCategory } from './yatzy-ai';
import { CATEGORIES } from '@/types/yatzy';

// Helper: build a scores object with given categories pre-filled (to 0 unless specified).
function scoresWith(filled: Partial<Record<string, number | null>> = {}): Record<string, number | null> {
  const s: Record<string, number | null> = {};
  for (const c of CATEGORIES) s[c.id] = null;
  for (const [k, v] of Object.entries(filled)) s[k] = v ?? 0;
  return s;
}

describe('aiPickCategory — upper vs fourOfAKind priority', () => {
  it('chooses sixes over fourOfAKind for [6,6,6,6,1] when sixes is open', () => {
    const dice = [6, 6, 6, 6, 1];
    const pick = aiPickCategory(dice, scoresWith());
    expect(pick).toBe('sixes');
  });

  it('chooses fives over fourOfAKind for [5,5,5,5,2] when fives is open', () => {
    const dice = [5, 5, 5, 5, 2];
    const pick = aiPickCategory(dice, scoresWith());
    expect(pick).toBe('fives');
  });

  it('chooses fours over fourOfAKind for [4,4,4,4,1] when fours is open', () => {
    const dice = [4, 4, 4, 4, 1];
    const pick = aiPickCategory(dice, scoresWith());
    expect(pick).toBe('fours');
  });

  it('falls back to fourOfAKind for [6,6,6,6,1] when sixes is already filled', () => {
    const dice = [6, 6, 6, 6, 1];
    const pick = aiPickCategory(dice, scoresWith({ sixes: 18 }));
    expect(pick).toBe('fourOfAKind');
  });

  it('takes fourOfAKind for [5,5,5,5,2] when fives is filled', () => {
    const dice = [5, 5, 5, 5, 2];
    const pick = aiPickCategory(dice, scoresWith({ fives: 15 }));
    expect(pick).toBe('fourOfAKind');
  });

  it('still picks yatzy for five of a kind even if upper is open', () => {
    const dice = [6, 6, 6, 6, 6];
    const pick = aiPickCategory(dice, scoresWith());
    expect(pick).toBe('yatzy');
  });

  it('chooses threes-upper over threeOfAKind for [3,3,3,1,2] (upper open, bonus path)', () => {
    const dice = [3, 3, 3, 1, 2];
    const pick = aiPickCategory(dice, scoresWith());
    // threes raw=9 hits target, threeOfAKind raw=9 too, but threes feeds bonus.
    expect(pick).toBe('threes');
  });
});
