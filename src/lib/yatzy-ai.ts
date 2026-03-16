import { CategoryId, CATEGORIES } from '@/types/yatzy';
import { calculateScore, getUpperSectionTotal } from '@/lib/yatzy-scoring';

// Simple everyday Swedish names
const AI_NAMES = ['Erik', 'Anna', 'Lars', 'Karin', 'Olle', 'Lisa', 'Sven', 'Eva'];

export function getAiName(index: number): string {
  return AI_NAMES[index % AI_NAMES.length];
}

// ─── Constants ───────────────────────────────────────────

const UPPER_IDS: CategoryId[] = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
const UPPER_FACE: Record<string, number> = {
  ones: 1, twos: 2, threes: 3, fours: 4, fives: 5, sixes: 6,
};
const UPPER_TARGET: Record<string, number> = {
  ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18,
};
const BONUS_THRESHOLD = 63;
const BONUS_VALUE = 50;

// ─── Helpers ─────────────────────────────────────────────

function getCounts(dice: number[]): number[] {
  const c = [0, 0, 0, 0, 0, 0];
  for (const d of dice) c[d - 1]++;
  return c;
}

function availableSet(scores: Record<string, number | null>): Set<string> {
  return new Set(
    CATEGORIES.filter(c => scores[c.id] === undefined || scores[c.id] === null).map(c => c.id),
  );
}

function longestRun(dice: number[]): number[] {
  const unique = [...new Set(dice)].sort((a, b) => a - b);
  if (unique.length === 0) return [];
  let best: number[] = [unique[0]];
  let cur: number[] = [unique[0]];
  for (let i = 1; i < unique.length; i++) {
    if (unique[i] === unique[i - 1] + 1) cur.push(unique[i]);
    else cur = [unique[i]];
    if (cur.length > best.length) best = [...cur];
  }
  return best;
}

function lockIndicesForValues(dice: number[], values: number[]): boolean[] {
  const locked = [false, false, false, false, false];
  const remaining = [...values];
  for (let i = 0; i < 5; i++) {
    const idx = remaining.indexOf(dice[i]);
    if (idx !== -1) {
      locked[i] = true;
      remaining.splice(idx, 1);
    }
  }
  return locked;
}

function lockAllOf(dice: number[], value: number): boolean[] {
  return dice.map(d => d === value);
}

function mergeLocks(a: boolean[], b: boolean[]): boolean[] {
  return a.map((v, i) => v || b[i]);
}

// ─── Expected-value helpers ──────────────────────────────

/** Estimate how many of `face` we expect after re-rolling `rerollCount` dice */
function expectedCountAfterReroll(currentCount: number, rerollCount: number): number {
  return currentCount + rerollCount / 6;
}

/** Upper bonus gap: how far are we from 63, and how realistic is it? */
function bonusInfo(scores: Record<string, number | null>, available: Set<string>) {
  const upperTotal = getUpperSectionTotal(scores);
  const upperLeft = UPPER_IDS.filter(c => available.has(c));
  const gap = BONUS_THRESHOLD - upperTotal;
  const avgPotential = upperLeft.reduce((s, c) => s + UPPER_TARGET[c], 0);
  return {
    gap,
    upperLeft,
    reachable: gap <= 0 || (upperLeft.length > 0 && avgPotential >= gap),
    alreadyHave: gap <= 0,
    urgency: upperLeft.length > 0 ? gap / upperLeft.length : 99,
  };
}

// ─── Category Scoring (Pro-level) ────────────────────────

function categoryValue(
  catId: CategoryId,
  score: number,
  scores: Record<string, number | null>,
  available: Set<string>,
): number {
  const bonus = bonusInfo(scores, available);

  // ── Upper section ──
  if (catId in UPPER_TARGET) {
    const target = UPPER_TARGET[catId];
    const face = UPPER_FACE[catId];

    if (bonus.alreadyHave) {
      // Bonus secured — just take raw value
      return score + 5;
    }

    if (bonus.reachable) {
      // Weight heavily toward meeting targets
      if (score >= target) return score + 30 + face; // on-target, prefer higher faces
      if (score >= target - face) return score + 15; // one die short of target
      if (score > 0) return score + 3;
      return -12 - face; // zeroing a high upper cat is very costly
    }

    // Bonus unreachable — moderate value
    if (score >= target) return score + 10;
    if (score > 0) return score;
    return -6;
  }

  // ── Lower section ──
  switch (catId) {
    case 'yatzy':
      return score === 50 ? 130 : -1; // massive reward; cheap sacrifice (rare)

    case 'largeStraight':
      return score === 20 ? 55 : -2;

    case 'smallStraight':
      return score === 15 ? 42 : -2;

    case 'fullHouse':
      return score > 0 ? score + 22 : -3;

    case 'fourOfAKind':
      return score > 0 ? score + 15 : -3;

    case 'threeOfAKind':
      return score > 0 ? score + 8 : -5;

    case 'twoPairs':
      return score > 0 ? score + 12 : -3;

    case 'pair':
      return score > 0 ? score + 3 : -7;

    case 'chance': {
      // Use chance wisely — only take if high sum
      if (score >= 28) return score + 15;
      if (score >= 24) return score + 8;
      if (score >= 20) return score;
      return score - 10;
    }

    default:
      return score;
  }
}

// ─── Category Selection ──────────────────────────────────

export function aiPickCategory(dice: number[], scores: Record<string, number | null>): CategoryId {
  const available = CATEGORIES.filter(c => scores[c.id] === undefined || scores[c.id] === null);
  if (available.length === 0) return 'chance';

  const avSet = availableSet(scores);
  const bonus = bonusInfo(scores, avSet);

  const scored = available.map(cat => {
    const raw = calculateScore(dice, cat.id);
    const value = categoryValue(cat.id, raw, scores, avSet);
    return { id: cat.id, score: raw, value };
  });

  scored.sort((a, b) => b.value - a.value);

  // If best option is positive, take it
  if (scored[0].value > 0) return scored[0].id;

  // All negative → sacrifice least valuable
  // Sacrifice categories that are hardest to fill AND cheapest to lose
  const sacrificeOrder: CategoryId[] = [
    'yatzy',           // hardest to fill, 0 loss most times
    'largeStraight',   // hard to fill
    'smallStraight',   // hard to fill  
    'fullHouse',       
    'fourOfAKind',     
    'twoPairs',        
    'threeOfAKind',    
    'pair',            
  ];

  // If bonus is reachable, prefer sacrificing lower section
  // If bonus is gone, consider sacrificing upper section zeros
  if (!bonus.reachable) {
    // Add low upper cats as sacrifice options
    sacrificeOrder.push('ones', 'twos', 'threes');
  }

  sacrificeOrder.push('chance');

  for (const cat of sacrificeOrder) {
    if (available.find(a => a.id === cat)) return cat;
  }
  return available[0].id;
}

// ─── Dice Locking (Pro-level) ────────────────────────────

/**
 * Evaluate multiple strategies and pick the one with highest expected value.
 * Each strategy produces a lock pattern; we score them and pick the best.
 */
export function aiDecideLocks(dice: number[], scores: Record<string, number | null>): boolean[] {
  const counts = getCounts(dice);
  const available = availableSet(scores);
  const bonus = bonusInfo(scores, available);
  const noLock = [false, false, false, false, false];

  interface Strategy {
    name: string;
    locks: boolean[];
    value: number;
  }

  const strategies: Strategy[] = [];

  const maxCount = Math.max(...counts);
  const maxVal = counts.lastIndexOf(maxCount) + 1;
  const run = longestRun(dice);

  // ── Strategy: Yatzy chase ──
  if (available.has('yatzy') && maxCount >= 3) {
    // With 3+, the EV of going for yatzy is significant
    const bestVal = counts.lastIndexOf(maxCount) + 1;
    const rerolls = 5 - maxCount;
    const prob = Math.pow(1 / 6, rerolls);
    const ev = prob * 50 + (1 - prob) * (bestVal * maxCount * 0.3); // fallback to N-of-a-kind value
    strategies.push({
      name: 'yatzy',
      locks: lockAllOf(dice, bestVal),
      value: maxCount >= 4 ? 80 : ev + (maxCount === 3 ? 5 : 0),
    });
  }

  // ── Strategy: Large straight ──
  if (available.has('largeStraight')) {
    if (run.length >= 4) {
      const missing = run.length === 4 ? 1 : 0;
      strategies.push({
        name: 'largeStraight',
        locks: lockIndicesForValues(dice, run),
        value: missing === 0 ? 55 : 20 * (1 / 6) + 10, // ~13 EV with 1 missing
      });
    } else if (run.length === 3 && maxCount <= 2) {
      strategies.push({
        name: 'largeStraight-early',
        locks: lockIndicesForValues(dice, run),
        value: 6, // speculative
      });
    }
  }

  // ── Strategy: Small straight ──
  if (available.has('smallStraight') && run.length >= 3) {
    if (run.length >= 4 && run[0] >= 1 && run[run.length - 1] <= 5) {
      strategies.push({ name: 'smallStraight-done', locks: lockIndicesForValues(dice, run), value: 40 });
    } else {
      strategies.push({
        name: 'smallStraight',
        locks: lockIndicesForValues(dice, run),
        value: run.length === 4 ? 30 : 10,
      });
    }
  }

  // ── Strategy: Full house ──
  if (available.has('fullHouse')) {
    let threeVal = 0, twoVal = 0;
    for (let i = 5; i >= 0; i--) {
      if (counts[i] >= 3 && !threeVal) threeVal = i + 1;
      else if (counts[i] >= 2 && !twoVal) twoVal = i + 1;
    }
    if (threeVal && twoVal) {
      // Already full house
      const fhScore = calculateScore(dice, 'fullHouse');
      strategies.push({ name: 'fullHouse-done', locks: [true, true, true, true, true], value: fhScore + 22 });
    } else if (threeVal) {
      strategies.push({
        name: 'fullHouse-need-pair',
        locks: lockAllOf(dice, threeVal),
        value: 15 + threeVal, // decent EV to find a pair in 2 dice
      });
    } else if (twoVal) {
      // Two pairs → keep both, try for trips
      const pairs: number[] = [];
      for (let i = 5; i >= 0; i--) if (counts[i] >= 2) pairs.push(i + 1);
      if (pairs.length >= 2) {
        const keepVals = [pairs[0], pairs[0], pairs[1], pairs[1]];
        strategies.push({
          name: 'fullHouse-two-pairs',
          locks: lockIndicesForValues(dice, keepVals),
          value: 10,
        });
      }
    }
  }

  // ── Strategy: Four of a kind ──
  if (available.has('fourOfAKind') && maxCount >= 3) {
    strategies.push({
      name: 'fourOfAKind',
      locks: lockAllOf(dice, maxVal),
      value: maxCount >= 4 ? maxVal * 4 + 15 : maxVal * 3 + 5,
    });
  }

  // ── Strategy: Three of a kind (keep for threeOfAKind, pair, etc.) ──
  if (maxCount >= 3 && (available.has('threeOfAKind') || available.has('fourOfAKind') || available.has('chance'))) {
    strategies.push({
      name: 'threeOfAKind',
      locks: lockAllOf(dice, maxVal),
      value: maxVal * 3 + 8,
    });
  }

  // ── Strategy: Two pairs ──
  if (available.has('twoPairs') || available.has('fullHouse')) {
    const pairs: number[] = [];
    for (let i = 5; i >= 0; i--) if (counts[i] >= 2) pairs.push(i + 1);
    if (pairs.length >= 2) {
      const keepVals = [pairs[0], pairs[0], pairs[1], pairs[1]];
      strategies.push({
        name: 'twoPairs',
        locks: lockIndicesForValues(dice, keepVals),
        value: pairs[0] * 2 + pairs[1] * 2 + 10,
      });
    }
  }

  // ── Strategy: High pair ──
  if (maxCount >= 2) {
    let bestPair = 0;
    for (let i = 5; i >= 0; i--) if (counts[i] >= 2) { bestPair = i + 1; break; }
    if (bestPair >= 3) {
      const pairLocks = lockAllOf(dice, bestPair);
      // Also keep other high dice for chance/upper
      const enhanced = dice.map((d, i) => pairLocks[i] || d >= 5);
      strategies.push({
        name: 'highPair',
        locks: enhanced,
        value: bestPair * 2 + 3,
      });
    }
  }

  // ── Strategy: Upper section targeting ──
  if (bonus.reachable && !bonus.alreadyHave) {
    // Find the best upper category to target
    for (const catId of bonus.upperLeft) {
      const face = UPPER_FACE[catId];
      const faceCount = counts[face - 1];
      if (faceCount >= 2) {
        const upperLocks = lockAllOf(dice, face);
        const expectedScore = expectedCountAfterReroll(faceCount, 5 - faceCount) * face;
        const targetDiff = expectedScore - UPPER_TARGET[catId];
        strategies.push({
          name: `upper-${catId}`,
          locks: upperLocks,
          value: expectedScore + (targetDiff >= 0 ? 15 : 5) + (face >= 5 ? 5 : 0),
        });
      }
    }
  }

  // ── Strategy: Keep high dice for chance ──
  if (available.has('chance')) {
    const sorted = [...dice].sort((a, b) => b - a);
    const threshold = sorted[2]; // top 3
    if (threshold >= 4) {
      strategies.push({
        name: 'chance-high',
        locks: dice.map(d => d >= threshold),
        value: sorted.slice(0, 3).reduce((s, v) => s + v, 0) + expectedCountAfterReroll(0, 2) * 3.5,
      });
    }
  }

  // Pick best strategy
  if (strategies.length > 0) {
    strategies.sort((a, b) => b.value - a.value);
    return strategies[0].locks;
  }

  // ── Fallback: keep high dice ──
  const sorted = [...dice].sort((a, b) => b - a);
  const keepThreshold = Math.max(sorted[2], 4);
  return dice.map(d => d >= keepThreshold);
}
