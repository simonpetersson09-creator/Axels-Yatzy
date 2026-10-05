/** Dice colour. White is default; bronze/silver/gold are permanent tiers, gold can also be temporary. */
export type DiceSkin = 'white' | 'bronze' | 'silver' | 'gold';

export const TIER_GOALS: { tier: Exclude<DiceSkin, 'white'>; goal: number }[] = [
  { tier: 'bronze', goal: 10 },
  { tier: 'silver', goal: 50 },
  { tier: 'gold', goal: 200 },
];

export const SKIN_RANK: Record<DiceSkin, number> = { white: 0, bronze: 1, silver: 2, gold: 3 };

export function asSkin(v: unknown): DiceSkin {
  return v === 'bronze' || v === 'silver' || v === 'gold' ? v : 'white';
}

/** Next tier to reach, or null when permanent gold is unlocked. */
export function nextTier(yatzyMatches: number) {
  return TIER_GOALS.find((g) => yatzyMatches < g.goal) ?? null;
}
