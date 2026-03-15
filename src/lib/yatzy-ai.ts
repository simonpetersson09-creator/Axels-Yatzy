import { CategoryId, CATEGORIES } from '@/types/yatzy';
import { calculateScore, getUpperSectionTotal } from '@/lib/yatzy-scoring';

const AI_NAMES = ['Alex', 'Nova', 'Elias', 'Saga', 'Leo', 'Wilma', 'Hugo', 'Alma'];

export function getAiName(index: number): string {
  return AI_NAMES[index % AI_NAMES.length];
}

// Target scores per upper category to reach 63 bonus
const UPPER_TARGETS: Record<string, number> = {
  ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18,
};

const UPPER_VALUE_MAP: Record<string, number> = {
  ones: 1, twos: 2, threes: 3, fours: 4, fives: 5, sixes: 6,
};

// ─── Helpers ─────────────────────────────────────────────

function getCounts(dice: number[]): number[] {
  const counts = [0, 0, 0, 0, 0, 0];
  dice.forEach(d => counts[d - 1]++);
  return counts;
}

function findLongestRun(sorted: number[]): number[] {
  if (sorted.length === 0) return [];
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

function availableSet(scores: Record<string, number | null>): Set<string> {
  return new Set(
    CATEGORIES
      .filter(cat => scores[cat.id] === undefined || scores[cat.id] === null)
      .map(cat => cat.id)
  );
}

// ─── Category Selection (Smarter) ───────────────────────

/**
 * Score a category pick with context-aware weighting.
 */
function categoryValue(
  catId: CategoryId,
  score: number,
  scores: Record<string, number | null>,
  available: Set<string>,
): number {
  const upperTotal = getUpperSectionTotal(scores);
  const upperCatsLeft = Object.keys(UPPER_TARGETS).filter(c => available.has(c));
  const needForBonus = 63 - upperTotal;
  const avgNeededPerSlot = upperCatsLeft.length > 0 ? needForBonus / upperCatsLeft.length : 99;
  const bonusReachable = upperCatsLeft.length > 0 && avgNeededPerSlot <= 18;

  // Upper section
  if (catId in UPPER_TARGETS) {
    const target = UPPER_TARGETS[catId];
    const val = UPPER_VALUE_MAP[catId];
    const maxPossible = val * 5;

    if (bonusReachable) {
      // Weight relative to how much this helps toward 63
      if (score >= target) return score + 20; // on-target or above → great
      if (score >= target * 0.7) return score + 10; // close to target
      if (score > 0) return score + 2;
      return -8; // zero hurts bonus chase
    }
    // Bonus not reachable — evaluate raw value
    if (score >= target) return score + 8;
    if (score > 0) return score;
    return -5;
  }

  // Lower section — value based on rarity and opportunity cost
  switch (catId) {
    case 'yatzy':
      return score === 50 ? 110 : -1; // huge if hit, cheap to sacrifice (rare)
    case 'largeStraight':
      return score === 20 ? 50 : -2;
    case 'smallStraight':
      return score === 15 ? 38 : -2;
    case 'fullHouse':
      return score > 0 ? score + 18 : -3;
    case 'fourOfAKind':
      return score > 0 ? score + 12 : -3;
    case 'threeOfAKind':
      return score > 0 ? score + 5 : -5;
    case 'twoPairs':
      return score > 0 ? score + 10 : -3;
    case 'pair':
      return score > 0 ? score + 2 : -6;
    case 'chance': {
      // Chance is a safety net — only take when sum is high
      if (score >= 26) return score + 8;
      if (score >= 22) return score + 3;
      if (score >= 18) return score - 2;
      return score - 8;
    }
    default:
      return score;
  }
}

/**
 * Pick the best category, considering opportunity cost and future rounds.
 */
export function aiPickCategory(dice: number[], scores: Record<string, number | null>): CategoryId {
  const available = CATEGORIES.filter(
    cat => scores[cat.id] === undefined || scores[cat.id] === null
  );
  if (available.length === 0) return 'chance';

  const avSet = availableSet(scores);

  const scored = available.map(cat => {
    const rawScore = calculateScore(dice, cat.id);
    const value = categoryValue(cat.id, rawScore, scores, avSet);
    return { id: cat.id, score: rawScore, value };
  });

  scored.sort((a, b) => b.value - a.value);

  if (scored[0].value > 0) return scored[0].id;

  // All negative — sacrifice least costly category
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

// ─── Dice Locking (Smarter) ─────────────────────────────

/**
 * Evaluate which dice to keep based on available categories and
 * what combinations are most valuable to pursue.
 */
export function aiDecideLocks(dice: number[], scores: Record<string, number | null>): boolean[] {
  const counts = getCounts(dice);
  const locked = [false, false, false, false, false];
  const available = availableSet(scores);

  const maxCount = Math.max(...counts);
  const maxVal = counts.lastIndexOf(maxCount) + 1; // highest value with maxCount

  // ── Priority 1: Yatzy chase ──
  if (available.has('yatzy') && maxCount >= 3) {
    // With 3+ of a kind, go for yatzy
    const val = counts.lastIndexOf(maxCount) + 1;
    for (let i = 0; i < 5; i++) if (dice[i] === val) locked[i] = true;
    return locked;
  }

  // ── Priority 2: Large straight ──
  const unique = [...new Set(dice)].sort((a, b) => a - b);
  const bestRun = findLongestRun(unique);

  if (available.has('largeStraight') && bestRun.length >= 4) {
    return lockValues(dice, bestRun);
  }

  // ── Priority 3: Full house when we have 3+2 or 3+1 ──
  if (available.has('fullHouse')) {
    let threeVal = 0, twoVal = 0;
    for (let i = 5; i >= 0; i--) {
      if (counts[i] >= 3 && !threeVal) threeVal = i + 1;
      else if (counts[i] >= 2 && !twoVal) twoVal = i + 1;
    }
    if (threeVal && twoVal) {
      for (let i = 0; i < 5; i++) locked[i] = true;
      return locked;
    }
    if (threeVal) {
      for (let i = 0; i < 5; i++) if (dice[i] === threeVal) locked[i] = true;
      return locked;
    }
  }

  // ── Priority 4: Four of a kind ──
  if (maxCount >= 4 && available.has('fourOfAKind')) {
    for (let i = 0; i < 5; i++) if (dice[i] === maxVal) locked[i] = true;
    return locked;
  }

  // ── Priority 5: Small straight with 3 in a row ──
  if ((available.has('smallStraight') || available.has('largeStraight')) && bestRun.length >= 3) {
    return lockValues(dice, bestRun);
  }

  // ── Priority 6: Three of a kind — keep for multiple categories ──
  if (maxCount >= 3) {
    // Prefer higher values
    let bestTriple = 0;
    for (let i = 5; i >= 0; i--) {
      if (counts[i] >= 3) { bestTriple = i + 1; break; }
    }
    if (bestTriple) {
      for (let i = 0; i < 5; i++) if (dice[i] === bestTriple) locked[i] = true;
      return locked;
    }
  }

  // ── Priority 7: Two pairs ──
  if (available.has('twoPairs') || available.has('fullHouse')) {
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

  // ── Priority 8: Pair of high values ──
  if (maxCount >= 2) {
    // Keep highest pair
    let bestPair = 0;
    for (let i = 5; i >= 0; i--) {
      if (counts[i] >= 2) { bestPair = i + 1; break; }
    }
    if (bestPair >= 3) {
      for (let i = 0; i < 5; i++) if (dice[i] === bestPair) locked[i] = true;
      return locked;
    }
  }

  // ── Priority 9: Upper section — keep dice matching needed categories ──
  const upperNeeded = ['sixes', 'fives', 'fours', 'threes', 'twos', 'ones']
    .filter(c => available.has(c));
  const upperVals = new Set(upperNeeded.map(c => UPPER_VALUE_MAP[c] || 0));

  // Keep multiples of upper-needed values (prefer higher)
  for (let i = 0; i < 5; i++) {
    if (upperVals.has(dice[i]) && counts[dice[i] - 1] >= 2) locked[i] = true;
  }
  if (locked.some(Boolean)) return locked;

  // ── Fallback: keep highest dice for chance ──
  const sorted = [...dice].sort((a, b) => b - a);
  const keepThreshold = sorted[2]; // keep top 3
  for (let i = 0; i < 5; i++) {
    if (dice[i] >= keepThreshold && dice[i] >= 4) locked[i] = true;
  }

  return locked;
}
