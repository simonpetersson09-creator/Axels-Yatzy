import { describe, it, expect, beforeAll } from 'vitest';
import { aiDecideLocks, aiPickCategory, optimalReady } from './yatzy-ai';
import { getOptimalPlayer } from '../../supabase/functions/_shared/yatzy/optimal-player';
import { aiDecideLocks as sLocks, aiPickCategory as sPick } from '../../supabase/functions/_shared/yatzy/ai';
import { CATEGORIES } from '@/types/yatzy';

const empty = () => Object.fromEntries(CATEGORIES.map(c => [c.id, null])) as Record<string, number | null>;
beforeAll(() => optimalReady);

describe('optimal computer', () => {
  it('expects the known optimum (~248.4) from an empty board', () => {
    expect(getOptimalPlayer().expected(empty())).toBeCloseTo(248.44, 1);
  });
  it('app and online computer make identical choices', () => {
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 300; i++) {
      const s = empty();
      CATEGORIES.forEach(c => { if (rnd() < 0.5) s[c.id] = 0; });
      const d = Array.from({ length: 5 }, () => 1 + Math.floor(rnd() * 6));
      if (CATEGORIES.every(c => s[c.id] !== null)) continue;
      expect(aiDecideLocks(d, s, 2)).toEqual(sLocks(d, s, 2));
      expect(aiPickCategory(d, s)).toBe(sPick(d, s));
    }
  });
  it('keeps a finished Yatzy and scores it', () => {
    expect(aiDecideLocks([4, 4, 4, 4, 4], empty(), 2)).toEqual([true, true, true, true, true]);
    expect(aiPickCategory([4, 4, 4, 4, 4], empty())).toBe('yatzy');
  });
});
