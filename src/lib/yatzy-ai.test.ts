import { describe, it, expect, vi, beforeAll } from 'vitest';
import { aiDecideLocks, aiPickCategory, optimalReady } from './yatzy-ai';
beforeAll(() => optimalReady);
import { aiDecideLocks as serverAiDecideLocks } from '../../supabase/functions/_shared/yatzy/ai';
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

describe('computer decision audit regressions', () => {
  function onlyOpen(...open: string[]): Record<string, number | null> {
    return Object.fromEntries(CATEGORIES.map(c => [c.id, open.includes(c.id) ? null : 0]));
  }

  it('splits four sixes to keep 6,6,6,2 when only full house remains', () => {
    const dice = [6, 6, 6, 2, 6];
    const locks = aiDecideLocks(dice, onlyOpen('fullHouse'), 1);
    expect(dice.filter((_, i) => locks[i]).sort()).toEqual([2, 6, 6, 6]);
  });

  it('keeps the pair of ones rather than rerolling everything for a final Yatzy', () => {
    expect(aiDecideLocks([3, 5, 4, 1, 1], onlyOpen('yatzy'), 1))
      .toEqual([false, false, false, true, true]);
  });

  it('uses no random samples for the last roll and repeats the same decision', () => {
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Random sample'); });
    try {
      for (let i = 0; i < 5; i++) {
        expect(aiDecideLocks([3, 5, 4, 1, 1], scoresWith(), 1))
          .toEqual(aiDecideLocks([3, 5, 4, 1, 1], scoresWith(), 1));
      }
      expect(random).not.toHaveBeenCalled();
    } finally { random.mockRestore(); }
  });

  it('takes three ones and the 50-point bonus at 60 upper points over a 7-point house', () => {
    expect(aiPickCategory([1, 2, 2, 1, 1], scoresWith({
      twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18,
    }))).toBe('ones');
  });

  it('takes three fours and the 50-point bonus at 53 upper points over a 16-point house', () => {
    expect(aiPickCategory([2, 4, 4, 4, 2], scoresWith({
      ones: 1, twos: 4, threes: 9, fives: 15, sixes: 24,
    }))).toBe('fours');
  });

  it('still takes a useful house when the upper bonus cannot be reached', () => {
    expect(aiPickCategory([6, 6, 6, 5, 5], onlyOpen('fullHouse', 'ones'))).toBe('fullHouse');
  });

  it('keeps three sixes and rerolls only the two other dice in the final upper slot', () => {
    const scores = { ...onlyOpen('sixes'), ones: 3, twos: 6, threes: 9, fours: 12, fives: 15 };
    expect(aiDecideLocks([6, 6, 6, 2, 1], scores, 1)).toEqual([true, true, true, false, false]);
  });
});

describe.each([['local', aiDecideLocks], ['online', serverAiDecideLocks]] as const)('only one upper score box remains (%s)', (_name, aiDecideLocks) => {
  const upperIds = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];

  it.each(upperIds)('always keeps exactly the matching dice for %s after roll 1 and roll 2', (category) => {
    const face = upperIds.indexOf(category) + 1;
    const scores = Object.fromEntries(CATEGORIES.map(c => [c.id, c.id === category ? null : 0]));
    const random = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('The last upper box must not use random simulations');
    });
    try {
      // Every possible ordered hand: includes no matches, all matches and mixed groups.
      for (let hand = 0; hand < 6 ** 5; hand++) {
        const dice = Array.from({ length: 5 }, (_, i) => Math.floor(hand / 6 ** i) % 6 + 1);
        const expected = dice.map(d => d === face);
        expect(aiDecideLocks(dice, scores, 2)).toEqual(expected);
        expect(aiDecideLocks(dice, scores, 1)).toEqual(expected);
      }
    } finally {
      random.mockRestore();
    }
  });

  it.each([0, 12, 15])('keeps only ones regardless of bonus progress (%i per filled upper box)', (score) => {
    const scores = Object.fromEntries(CATEGORIES.map(c => [c.id, c.id === 'ones' ? null : score]));
    for (const rollsLeft of [2, 1]) {
      expect(aiDecideLocks([6, 1, 6, 1, 6], scores, rollsLeft))
        .toEqual([false, true, false, true, false]);
    }
  });
});

describe.each([['local', aiDecideLocks], ['online', serverAiDecideLocks]] as const)('no unusable holds when only upper boxes remain (%s)', (_name, aiDecideLocks) => {
  it('rerolls two and every other filled face after either roll across all upper combinations without twos', () => {
    const ids = ['ones', 'threes', 'fours', 'fives', 'sixes'];
    let seed = 9;
    const random = vi.spyOn(Math, 'random').mockImplementation(() => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    });
    try {
      for (let mask = 1; mask < 32; mask++) {
        const open = ids.filter((_, i) => mask & (1 << i));
        const scores = Object.fromEntries(CATEGORIES.map(c => [c.id, open.includes(c.id) ? null : 0]));
        const faces = open.map(id => ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'].indexOf(id) + 1);
        for (let n = 0; n < 30; n++) {
          const dice = Array.from({ length: 5 }, () => 1 + Math.floor(Math.random() * 6));
          for (const rollsLeft of [2, 1]) {
            const locks = aiDecideLocks(dice, scores, rollsLeft);
            expect(dice.filter((face, i) => locks[i] && !faces.includes(face)))
              .toEqual([]);
          }
        }
      }
    } finally {
      random.mockRestore();
    }
  }, 30000);

  it('still keeps twos for a Yatzy when twos are filled', () => {
    const scores = Object.fromEntries(CATEGORIES.map(c => [c.id, c.id === 'yatzy' ? null : 0]));
    expect(aiDecideLocks([2, 2, 2, 2, 6], scores, 2))
      .toEqual([true, true, true, true, false]);
    expect(aiDecideLocks([2, 2, 2, 2, 6], scores, 1))
      .toEqual([true, true, true, true, false]);
  });
});

describe.each([['local', aiDecideLocks], ['online', serverAiDecideLocks]] as const)('exact choices after the first roll (%s)', (_name, aiDecideLocks) => {
  const only = (open: string[]) => Object.fromEntries(
    CATEGORIES.map(c => [c.id, open.includes(c.id) ? null : 0]),
  ) as Record<string, number | null>;

  it('keeps a three of a kind when four of a kind and Yatzy are open', () => {
    const scores = only(['fourOfAKind', 'yatzy']);
    for (let i = 0; i < 5; i++) {
      expect(aiDecideLocks([2, 3, 4, 4, 4], scores, 2)).toEqual([false, false, true, true, true]);
    }
  });

  it('keeps a four of a kind when Yatzy is open', () => {
    const scores = only(['yatzy', 'chance']);
    for (let i = 0; i < 5; i++) {
      expect(aiDecideLocks([4, 4, 4, 4, 5], scores, 2)).toEqual([true, true, true, true, false]);
    }
  });

  it('does not keep a worthless hand when only two pairs and Yatzy remain', () => {
    const scores = only(['twoPairs', 'yatzy']);
    for (let i = 0; i < 5; i++) {
      expect(aiDecideLocks([1, 3, 4, 5, 5], scores, 2)).not.toEqual([true, true, true, true, true]);
    }
  });
});
