import { CategoryId, CATEGORIES } from '@/types/yatzy';
import { calculateScore } from '@/lib/yatzy-scoring';

/**
 * AI strategy for Yatzy. Determines which dice to lock and which category to pick.
 */

const AI_NAMES = ['Dice Master', 'Lucky Roller', 'Cube King'];

export function getAiName(index: number): string {
  return AI_NAMES[index % AI_NAMES.length];
}

/**
 * Given current dice and available categories, decide which dice to lock.
 * Returns a boolean array [5] indicating which dice to keep.
 */
export function aiDecideLocks(dice: number[], scores: Record<string, number | null>): boolean[] {
  const counts = getCounts(dice);
  const locked = [false, false, false, false, false];

  // Find best potential: look for groups
  let bestVal = 0;
  let bestCount = 0;
  for (let i = 5; i >= 0; i--) {
    if (counts[i] >= bestCount) {
      // Prefer higher counts, then higher values
      if (counts[i] > bestCount || (counts[i] === bestCount && (i + 1) > bestVal)) {
        bestCount = counts[i];
        bestVal = i + 1;
      }
    }
  }

  // Check for straight potential
  const sorted = [...dice].sort((a, b) => a - b);
  const unique = [...new Set(sorted)];
  const hasSmallStraightPotential = unique.length >= 4 && scores['smallStraight'] === undefined;
  const hasLargeStraightPotential = unique.length >= 4 && scores['largeStraight'] === undefined;

  // If we have 4+ in a row, keep the straight
  if ((hasSmallStraightPotential || hasLargeStraightPotential) && unique.length >= 4) {
    const isSequential = (vals: number[]) => {
      for (let i = 1; i < vals.length; i++) {
        if (vals[i] !== vals[i - 1] + 1) return false;
      }
      return true;
    };
    // Find longest sequential run
    let bestRun: number[] = [];
    for (let start = 0; start < unique.length; start++) {
      for (let end = unique.length; end > start; end--) {
        const sub = unique.slice(start, end);
        if (isSequential(sub) && sub.length > bestRun.length) {
          bestRun = sub;
        }
      }
    }
    if (bestRun.length >= 4) {
      const runSet = new Set(bestRun);
      const used = new Set<number>();
      for (let i = 0; i < dice.length; i++) {
        if (runSet.has(dice[i]) && !used.has(dice[i])) {
          locked[i] = true;
          used.add(dice[i]);
        }
      }
      return locked;
    }
  }

  // If we have 3+ of a kind, keep those
  if (bestCount >= 3) {
    for (let i = 0; i < dice.length; i++) {
      if (dice[i] === bestVal) locked[i] = true;
    }
    return locked;
  }

  // If we have a pair of high values (4+), keep them
  if (bestCount >= 2 && bestVal >= 4) {
    for (let i = 0; i < dice.length; i++) {
      if (dice[i] === bestVal) locked[i] = true;
    }
    return locked;
  }

  // Keep any high individual dice (5, 6)
  for (let i = 0; i < dice.length; i++) {
    if (dice[i] >= 5) locked[i] = true;
  }

  return locked;
}

/**
 * Given current dice and player scores, pick the best available category.
 */
export function aiPickCategory(dice: number[], scores: Record<string, number | null>): CategoryId {
  const available = CATEGORIES.filter(
    cat => scores[cat.id] === undefined || scores[cat.id] === null
  );

  if (available.length === 0) return 'chance'; // fallback

  // Score each available category
  const scored = available.map(cat => ({
    id: cat.id,
    score: calculateScore(dice, cat.id),
    section: cat.section,
  }));

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // If top score is > 0, pick it (prefer higher scores)
  if (scored[0].score > 0) {
    return scored[0].id;
  }

  // All zeros — sacrifice the least valuable category
  // Prefer to zero out lower section categories first (except chance)
  const sacrificeOrder: CategoryId[] = [
    'yatzy', 'largeStraight', 'smallStraight', 'fullHouse',
    'fourOfAKind', 'twoPairs', 'threeOfAKind', 'pair',
    'ones', 'twos', 'threes', 'chance',
  ];

  for (const cat of sacrificeOrder) {
    if (available.find(a => a.id === cat)) {
      return cat;
    }
  }

  return available[0].id;
}

function getCounts(dice: number[]): number[] {
  const counts = [0, 0, 0, 0, 0, 0];
  dice.forEach(d => counts[d - 1]++);
  return counts;
}
