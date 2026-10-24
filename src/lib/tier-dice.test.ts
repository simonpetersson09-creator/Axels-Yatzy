import { describe, it, expect } from 'vitest';
import { isTierSkin, SKIN_RANK, type DiceSkin } from '@/lib/dice-skin';
import { profileSkin, type DiceProfile } from '@/lib/gold-dice';

const base: DiceProfile = { isBot: false, tier: 'platinum', yatzyMatches: 1000, inviteGold: false };

describe('isTierSkin', () => {
  it('accepts the four earned tier colours', () => {
    expect(isTierSkin('bronze')).toBe(true);
    expect(isTierSkin('silver')).toBe(true);
    expect(isTierSkin('gold')).toBe(true);
    expect(isTierSkin('platinum')).toBe(true);
  });

  it('rejects white, shop designs and junk', () => {
    expect(isTierSkin('white')).toBe(false);
    expect(isTierSkin('legend')).toBe(false);
    expect(isTierSkin(null)).toBe(false);
    expect(isTierSkin(undefined)).toBe(false);
  });
});

describe('profileSkin with a picked tier', () => {
  it('uses the picked tier colour instead of the earned tier', () => {
    expect(profileSkin({ ...base, design: 'silver' })).toBe('silver');
    expect(profileSkin({ ...base, design: 'bronze' })).toBe('bronze');
  });

  it('picked tier wins over temporary invite gold', () => {
    expect(profileSkin({ ...base, tier: 'bronze', inviteGold: true, design: 'bronze' })).toBe('bronze');
  });

  it('shop designs still win over the tier', () => {
    expect(profileSkin({ ...base, design: 'legend' })).toBe('d:legend');
  });

  it('unknown design falls back to the earned tier', () => {
    expect(profileSkin({ ...base, design: 'no-such-design' })).toBe('platinum');
  });

  it('no design keeps the old behaviour (temp gold, prefer white)', () => {
    expect(profileSkin({ ...base, tier: 'silver', inviteGold: true })).toBe('gold');
    expect(profileSkin({ ...base, preferWhite: true })).toBe('white');
  });
});

describe('unlocked tier filter', () => {
  const unlocked = (tier: DiceSkin) =>
    (['bronze', 'silver', 'gold', 'platinum'] as const).filter((t) => SKIN_RANK[t] <= SKIN_RANK[tier]);

  it('white unlocks nothing', () => {
    expect(unlocked('white')).toEqual([]);
  });

  it('silver unlocks bronze and silver only', () => {
    expect(unlocked('silver')).toEqual(['bronze', 'silver']);
  });

  it('platinum unlocks all four tiers', () => {
    expect(unlocked('platinum')).toEqual(['bronze', 'silver', 'gold', 'platinum']);
  });
});
