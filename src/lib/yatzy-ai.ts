import { CategoryId, CATEGORIES } from '@/types/yatzy';
import { calculateScore, getUpperSectionTotal } from '@/lib/yatzy-scoring';

const AI_NAMES = ['Dice Master', 'Lucky Roller', 'Cube King'];

export function getAiName(index: number): string {
  return AI_NAMES[index % AI_NAMES.length];
}

// Expected value for upper section categories (average per die if going for it)
const UPPER_TARGETS: Record<string, number> = {
  ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18,
};

/**
 * Evaluate how "good" a score is for a category relative to its expected value.
 * Returns a priority score where higher = better pick.
 */
function categoryValue(
  catId: CategoryId,
  score: number,
  scores: Record<string, number | null>,
): number {
  // Upper section: consider bonus pursuit
  if (catId in UPPER_TARGETS) {
    const target = UPPER_TARGETS[catId];
    if (score >= target) return score + 15; // bonus boost — worth taking
    if (score > 0) return score + 5; // decent but below target
    return -5; // zero in upper = bad, avoid unless necessary
  }

  // Lower section value ratings
  switch (catId) {
    case 'yatzy': return score === 50 ? 100 : -2; // huge if hit, cheap to sacrifice
    case 'largeStraight': return score === 20 ? 45 : -3;
    case 'smallStraight': return score === 15 ? 35 : -3;
    case 'fullHouse': return score > 0 ? score + 15 : -4;
    case 'fourOfAKind': return score > 0 ? score + 10 : -4;
    case 'threeOfAKind': return score > 0 ? score + 5 : -5;
    case 'twoPairs': return score > 0 ? score + 8 : -4;
    case 'pair': return score > 0 ? score + 3 : -6;
    case 'chance': {
      // Chance is a safety net — only use when sum is high or as last resort
      if (score >= 25) return score + 5;
      if (score >= 20) return score;
      return score - 5;
    }
    default: return score;
  }
}

/**
 * Pick the best category considering opportunity cost and bonus strategy.
 */
export function aiPickCategory(dice: number[], scores: Record<string, number | null>): CategoryId {
  const available = CATEGORIES.filter(
    cat => scores[cat.id] === undefined || scores[cat.id] === null
  );
  if (available.length === 0) return 'chance';

  const upperTotal = getUpperSectionTotal(scores);
  const upperCatsLeft = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes']
    .filter(c => scores[c] === undefined || scores[c] === null);
  const needForBonus = 63 - upperTotal;
  const bonusReachable = upperCatsLeft.length > 0 && needForBonus <= upperCatsLeft.length * 15;

  const scored = available.map(cat => {
    const rawScore = calculateScore(dice, cat.id);
    let value = categoryValue(cat.id, rawScore, scores);

    // Bonus strategy: boost upper section picks that help reach 63
    if (bonusReachable && cat.id in UPPER_TARGETS && rawScore >= UPPER_TARGETS[cat.id]) {
      value += 10;
    }

    return { id: cat.id, score: rawScore, value };
  });

  scored.sort((a, b) => b.value - a.value);

  // If best value is positive, take it
  if (scored[0].value > 0) return scored[0].id;

  // All negative — sacrifice least valuable category with 0
  const sacrificeOrder: CategoryId[] = [
    'yatzy', 'largeStraight', 'smallStraight', 'fullHouse',
    'fourOfAKind', 'twoPairs', 'threeOfAKind', 'pair',
    'ones', 'twos', 'threes', 'chance',
  ];
  for (const cat of sacrificeOrder) {
    if (available.find(a => a.id === cat)) return cat;
  }
  return available[0].id;
}

/**
 * Smarter dice locking: considers which categories are still available
 * and what combinations to aim for.
 */
export function aiDecideLocks(dice: number[], scores: Record<string, number | null>): boolean[] {
  const counts = getCounts(dice);
  const locked = [false, false, false, false, false];
  const available = new Set(
    CATEGORIES
      .filter(cat => scores[cat.id] === undefined || scores[cat.id] === null)
      .map(cat => cat.id)
  );

  // Check for Yatzy potential
  if (available.has('yatzy')) {
    const maxCount = Math.max(...counts);
    if (maxCount >= 4) {
      const val = counts.indexOf(maxCount) + 1;
      for (let i = 0; i < 5; i++) if (dice[i] === val) locked[i] = true;
      return locked;
    }
  }

  // Check for straight potential
  const unique = [...new Set(dice)].sort((a, b) => a - b);
  const hasSmall = available.has('smallStraight');
  const hasLarge = available.has('largeStraight');

  if (hasSmall || hasLarge) {
    const bestRun = findLongestRun(unique);
    if (bestRun.length >= 4) {
      // Prefer large straight target
      if (hasLarge && bestRun.includes(6) && bestRun.length >= 4) {
        return lockValues(dice, bestRun);
      }
      if (hasSmall && bestRun.includes(1) && bestRun.length >= 4) {
        return lockValues(dice, bestRun);
      }
      return lockValues(dice, bestRun);
    }
    // 3 in a row is still worth pursuing if we have rolls left
    if (bestRun.length >= 3 && unique.length >= 3) {
      return lockValues(dice, bestRun);
    }
  }

  // Check for full house potential
  if (available.has('fullHouse')) {
    let threeVal = 0, twoVal = 0;
    for (let i = 5; i >= 0; i--) {
      if (counts[i] >= 3 && !threeVal) threeVal = i + 1;
      else if (counts[i] >= 2 && !twoVal) twoVal = i + 1;
    }
    if (threeVal && twoVal) {
      // Already have full house — lock all
      for (let i = 0; i < 5; i++) locked[i] = true;
      return locked;
    }
    if (threeVal) {
      for (let i = 0; i < 5; i++) if (dice[i] === threeVal) locked[i] = true;
      return locked;
    }
  }

  // N-of-a-kind strategy
  let bestVal = 0, bestCount = 0;
  for (let i = 5; i >= 0; i--) {
    if (counts[i] > bestCount || (counts[i] === bestCount && (i + 1) > bestVal)) {
      bestCount = counts[i];
      bestVal = i + 1;
    }
  }

  // Four of a kind
  if (bestCount >= 4 && available.has('fourOfAKind')) {
    for (let i = 0; i < 5; i++) if (dice[i] === bestVal) locked[i] = true;
    return locked;
  }

  // Three of a kind — keep, useful for threeOfAKind, fourOfAKind, fullHouse, yatzy
  if (bestCount >= 3) {
    for (let i = 0; i < 5; i++) if (dice[i] === bestVal) locked[i] = true;
    return locked;
  }

  // Two pairs
  if (available.has('twoPairs')) {
    const pairs: number[] = [];
    for (let i = 5; i >= 0; i--) {
      if (counts[i] >= 2) pairs.push(i + 1);
    }
    if (pairs.length >= 2) {
      const keepSet = new Set(pairs.slice(0, 2));
      const used: Record<number, number> = {};
      for (let i = 0; i < 5; i++) {
        if (keepSet.has(dice[i])) {
          used[dice[i]] = (used[dice[i]] || 0) + 1;
          if (used[dice[i]] <= 2) locked[i] = true;
        }
      }
      return locked;
    }
  }

  // Pair of high values — keep
  if (bestCount >= 2 && bestVal >= 4) {
    for (let i = 0; i < 5; i++) if (dice[i] === bestVal) locked[i] = true;
    return locked;
  }

  // Upper section strategy: keep dice matching needed upper categories
  const upperNeeded = ['sixes', 'fives', 'fours', 'threes', 'twos', 'ones']
    .filter(c => available.has(c as CategoryId));
  const upperVals = new Set(
    upperNeeded.map(c => ({ ones: 1, twos: 2, threes: 3, fours: 4, fives: 5, sixes: 6 }[c] || 0))
  );

  for (let i = 0; i < 5; i++) {
    if (dice[i] >= 5 && upperVals.has(dice[i])) locked[i] = true;
  }

  // Fallback: keep high dice
  if (!locked.some(Boolean)) {
    for (let i = 0; i < 5; i++) if (dice[i] >= 5) locked[i] = true;
  }

  return locked;
}

function lockValues(dice: number[], values: number[]): boolean[] {
  const locked = [false, false, false, false, false];
  const remaining = [...values];
  for (let i = 0; i < dice.length; i++) {
    const idx = remaining.indexOf(dice[i]);
    if (idx !== -1) {
      locked[i] = true;
      remaining.splice(idx, 1);
    }
  }
  return locked;
}

function findLongestRun(sorted: number[]): number[] {
  let bestRun: number[] = [sorted[0]];
  let currentRun: number[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] + 1) {
      currentRun.push(sorted[i]);
    } else {
      currentRun = [sorted[i]];
    }
    if (currentRun.length > bestRun.length) bestRun = [...currentRun];
  }
  return bestRun;
}

function getCounts(dice: number[]): number[] {
  const counts = [0, 0, 0, 0, 0, 0];
  dice.forEach(d => counts[d - 1]++);
  return counts;
}
