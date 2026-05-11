import { CategoryId, CATEGORIES } from '@/types/yatzy';
import { calculateScore, getUpperSectionTotal } from '@/lib/yatzy-scoring';

// ─── Names ───────────────────────────────────────────────

const AI_NAMES = [
  'Erik', 'Anna', 'Lars', 'Karin', 'Olle', 'Lisa', 'Sven', 'Eva',
  'Astrid', 'Gustav', 'Maja', 'Nils', 'Sofia', 'Johan', 'Elin', 'Magnus',
  'Linnea', 'Oskar', 'Hanna', 'Filip', 'Sara', 'Anders', 'Klara', 'Mikael',
  'Ida', 'Henrik', 'Frida', 'Jonas', 'Emma', 'Viktor',
];

export function getAiName(index: number): string {
  return AI_NAMES[index % AI_NAMES.length];
}

export function getRandomAiNames(count: number): string[] {
  const pool = [...AI_NAMES];
  const result: string[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    result.push(pool.splice(idx, 1)[0]);
  }
  return result;
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

/**
 * Approximate baseline expected score per category if we were to play
 * that category in isolation with 3 rolls and optimal keep-decisions.
 * These represent the long-term opportunity cost of "burning" a category
 * with a sub-optimal score now.
 */
const BASELINE_EV: Record<CategoryId, number> = {
  ones: 1.88,
  twos: 3.75,
  threes: 5.62,
  fours: 7.50,
  fives: 9.38,
  sixes: 11.25,
  pair: 7.5,
  twoPairs: 11,
  threeOfAKind: 8,
  fourOfAKind: 5,
  smallStraight: 9,    // 15 * ~0.6 chance with 3 rolls
  largeStraight: 6,    // 20 * ~0.3 chance with 3 rolls
  fullHouse: 11,
  chance: 22,
  yatzy: 2.5,          // 50 * ~0.05 chance opportunistically
};

// ─── Helpers ─────────────────────────────────────────────

function getCounts(dice: number[]): number[] {
  const c = [0, 0, 0, 0, 0, 0];
  for (const d of dice) c[d - 1]++;
  return c;
}

function availableList(scores: Record<string, number | null>): CategoryId[] {
  return CATEGORIES
    .filter(c => scores[c.id] === undefined || scores[c.id] === null)
    .map(c => c.id);
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

function rollD6(): number {
  return 1 + Math.floor(Math.random() * 6);
}

function rerollDice(dice: number[], locks: boolean[]): number[] {
  return dice.map((v, i) => locks[i] ? v : rollD6());
}

// ─── Bonus pressure ──────────────────────────────────────

interface BonusInfo {
  upperTotal: number;
  gap: number;                // how many points to bonus
  upperLeft: CategoryId[];    // remaining upper categories
  reachable: boolean;         // can we still reach 63 in theory?
  alreadyHave: boolean;
  /** Per-point value of upper progress in this game state. */
  pointValue: number;
}

function bonusInfo(scores: Record<string, number | null>, available: Set<string>): BonusInfo {
  const upperTotal = getUpperSectionTotal(scores);
  const upperLeft = UPPER_IDS.filter(c => available.has(c));
  const gap = BONUS_THRESHOLD - upperTotal;
  const maxRemaining = upperLeft.reduce((s, c) => s + 5 * UPPER_FACE[c], 0);
  const alreadyHave = gap <= 0;
  const reachable = alreadyHave || maxRemaining >= gap;

  // Marginal value of each upper point. When far from bonus but reachable,
  // each point is worth ~50/gap (since closing the gap unlocks +50).
  // Cap so a single die's contribution is meaningful but not overwhelming.
  let pointValue = 1;
  if (alreadyHave) {
    pointValue = 1; // points are just face value
  } else if (reachable && upperLeft.length > 0) {
    // The closer we are, the more each point matters.
    pointValue = Math.min(2.2, 1 + 50 / Math.max(gap * (upperLeft.length + 1), 30));
  } else {
    pointValue = 1;
  }

  return { upperTotal, gap, upperLeft, reachable, alreadyHave, pointValue };
}

// ─── Final-dice valuation ────────────────────────────────

/**
 * Given a final 5-dice hand and the current scoresheet, compute the
 * marginal value of the BEST placement choice for those dice.
 * Marginal value = realised score - opportunity cost of the burned slot
 * (its baseline EV) + upper-bonus pressure adjustments.
 *
 * Used both for evaluating Monte-Carlo samples and for picking categories
 * at rollsLeft=0.
 */
function bestPlacementValue(
  dice: number[],
  scores: Record<string, number | null>,
  available: CategoryId[],
  bonus: BonusInfo,
): { catId: CategoryId; value: number; rawScore: number } {
  let bestCat: CategoryId = available[0];
  let bestValue = -Infinity;
  let bestRaw = 0;

  for (const catId of available) {
    const raw = calculateScore(dice, catId);
    const baseline = BASELINE_EV[catId];

    // Marginal value of placing here = score earned now minus
    // what we'd typically score for that slot later.
    let value = raw - baseline;

    // Upper bonus pressure
    if (catId in UPPER_FACE) {
      const target = UPPER_TARGET[catId];
      const face = UPPER_FACE[catId];
      const surplus = raw - target; // negative if under, positive if over

      if (!bonus.alreadyHave && bonus.reachable) {
        // Each point above/below target is worth pointValue extra (~1.3-2.2)
        // beyond face value, because it changes the bonus equation.
        value += surplus * bonus.pointValue;
        // Heavy penalty for zero-ing a bonus-reachable upper slot:
        // it removes the entire face's contribution from the bonus path.
        if (raw === 0) value -= face * 1.5;
      } else if (bonus.alreadyHave) {
        // Surplus still nice but not critical
        value += Math.max(0, surplus) * 0.3;
      }
    }

    // Strong premium hands deserve a small "loyalty" bump so the AI
    // doesn't dump them into chance/upper when both options score similarly.
    if (catId === 'yatzy' && raw === 50) value += 5;
    if (catId === 'largeStraight' && raw === 20) value += 3;
    if (catId === 'smallStraight' && raw === 15) value += 2;
    if (catId === 'fullHouse' && raw > 0) value += 2;

    if (value > bestValue) {
      bestValue = value;
      bestCat = catId;
      bestRaw = raw;
    }
  }

  return { catId: bestCat, value: bestValue, rawScore: bestRaw };
}

// ─── Greedy reroll heuristic for inner simulation ────────

/**
 * Cheap, deterministic lock heuristic used INSIDE Monte-Carlo simulation
 * for subsequent rolls. Avoids recursive simulation explosion.
 */
function greedyLocksForSim(dice: number[], available: Set<string>): boolean[] {
  const counts = getCounts(dice);
  const run = longestRun(dice);

  // 1. Yatzy chase if 4+ same and yatzy open
  for (let f = 6; f >= 1; f--) {
    if (counts[f - 1] >= 4 && available.has('yatzy')) return lockAllOf(dice, f);
  }

  // 2. Completed straights/full house — keep all
  const sorted = [...dice].sort((a, b) => a - b).join('');
  if ((sorted === '12345' && available.has('smallStraight')) ||
      (sorted === '23456' && available.has('largeStraight'))) {
    return [true, true, true, true, true];
  }
  const hasThree = counts.findIndex(c => c >= 3);
  const hasTwoOther = counts.findIndex((c, i) => c >= 2 && i !== hasThree);
  if (hasThree !== -1 && hasTwoOther !== -1 && available.has('fullHouse')) {
    return [true, true, true, true, true];
  }

  // 3. Building a straight
  if (run.length >= 4 && (available.has('smallStraight') || available.has('largeStraight'))) {
    return lockIndicesForValues(dice, run);
  }

  // 4. Triples → keep for fourOfAKind/yatzy/upper
  for (let f = 6; f >= 1; f--) {
    if (counts[f - 1] >= 3) return lockAllOf(dice, f);
  }

  // 5. Best pair if it's high (>=4) or if matching face is open in upper
  let bestPairFace = 0;
  for (let f = 6; f >= 1; f--) {
    if (counts[f - 1] >= 2) { bestPairFace = f; break; }
  }
  if (bestPairFace >= 4) return lockAllOf(dice, bestPairFace);
  if (bestPairFace > 0) {
    const upperId = UPPER_IDS[bestPairFace - 1];
    if (available.has(upperId)) return lockAllOf(dice, bestPairFace);
  }

  // 6. Two pairs for twoPairs/fullHouse
  const pairs: number[] = [];
  for (let f = 6; f >= 1; f--) if (counts[f - 1] >= 2) pairs.push(f);
  if (pairs.length >= 2 && (available.has('twoPairs') || available.has('fullHouse'))) {
    return dice.map(d => d === pairs[0] || d === pairs[1]);
  }

  // 7. Default: keep 5s and 6s
  return dice.map(d => d >= 5);
}

// ─── Monte-Carlo simulation of remaining rolls ───────────

/**
 * Given a lock pattern and remaining rolls, produce a sample of the final
 * dice hand. Uses a greedy heuristic for any locks needed AFTER the first
 * reroll so we don't blow up cost recursively.
 */
function sampleFinalDice(
  locks: boolean[],
  dice: number[],
  rollsRemaining: number,
  available: Set<string>,
): number[] {
  let d = rerollDice(dice, locks);
  let r = rollsRemaining - 1;
  while (r > 0) {
    const greedy = greedyLocksForSim(d, available);
    if (greedy.every(Boolean)) break;
    d = rerollDice(d, greedy);
    r -= 1;
  }
  return d;
}

// ─── Candidate keep-set generation ───────────────────────

function uniqueLockKey(locks: boolean[]): string {
  return locks.map(l => l ? '1' : '0').join('');
}

function generateCandidateLocks(dice: number[], available: Set<string>): boolean[][] {
  const seen = new Set<string>();
  const out: boolean[][] = [];
  const add = (locks: boolean[]) => {
    const key = uniqueLockKey(locks);
    if (!seen.has(key)) { seen.add(key); out.push(locks); }
  };

  // Reroll all & keep all baselines
  add([false, false, false, false, false]);
  add([true, true, true, true, true]);

  const counts = getCounts(dice);

  // Lock all of each face that appears
  for (let f = 1; f <= 6; f++) {
    if (counts[f - 1] > 0) add(lockAllOf(dice, f));
  }

  // Lock pairs of two faces (twoPairs / fullHouse / chance combos)
  for (let f1 = 1; f1 <= 6; f1++) {
    if (counts[f1 - 1] === 0) continue;
    for (let f2 = f1; f2 <= 6; f2++) {
      if (counts[f2 - 1] === 0) continue;
      if (f1 === f2 && counts[f1 - 1] < 2) continue;
      add(dice.map(d => d === f1 || d === f2));
    }
  }

  // Straight building
  const run = longestRun(dice);
  if (run.length >= 2) add(lockIndicesForValues(dice, run));
  // Specifically lock sub-runs for small/large straight
  if (available.has('smallStraight')) {
    const wanted = [1, 2, 3, 4, 5].filter(v => dice.includes(v));
    if (wanted.length >= 2) add(lockIndicesForValues(dice, wanted));
  }
  if (available.has('largeStraight')) {
    const wanted = [2, 3, 4, 5, 6].filter(v => dice.includes(v));
    if (wanted.length >= 2) add(lockIndicesForValues(dice, wanted));
  }

  // High dice for chance
  add(dice.map(d => d >= 4));
  add(dice.map(d => d >= 5));

  // Three-of-a-kind + an extra high die (for fullHouse/upper)
  for (let f = 1; f <= 6; f++) {
    if (counts[f - 1] >= 3) {
      let added = 0;
      const locks = dice.map(d => d === f);
      for (let i = 0; i < 5 && added < 1; i++) {
        if (!locks[i] && dice[i] >= 4) { locks[i] = true; added++; }
      }
      add(locks);
    }
  }

  return out;
}

// ─── EV evaluation for a keep pattern ────────────────────

function MC_SAMPLES(rollsRemaining: number): number {
  // More rolls left = more variance, more samples needed
  return rollsRemaining >= 2 ? 90 : 60;
}

function evaluateKeepEV(
  locks: boolean[],
  dice: number[],
  rollsRemaining: number,
  scores: Record<string, number | null>,
  available: CategoryId[],
  availableSet: Set<string>,
  bonus: BonusInfo,
): number {
  const samples = MC_SAMPLES(rollsRemaining);
  let total = 0;
  for (let i = 0; i < samples; i++) {
    const finalDice = sampleFinalDice(locks, dice, rollsRemaining, availableSet);
    total += bestPlacementValue(finalDice, scores, available, bonus).value;
  }
  return total / samples;
}

// ─── Public: pick category at rollsLeft = 0 ──────────────

export function aiPickCategory(
  dice: number[],
  scores: Record<string, number | null>,
): CategoryId {
  const available = availableList(scores);
  if (available.length === 0) return 'chance';
  if (available.length === 1) return available[0];

  const avSet = new Set<string>(available);
  const bonus = bonusInfo(scores, avSet);

  // ─── Hard priority overrides (never sacrifice a finished premium hand) ───
  const counts = getCounts(dice);
  const sorted = [...dice].sort((a, b) => a - b).join('');

  // 1. Yatzy: 5 of a kind always goes to yatzy if open
  if (counts.some(c => c === 5) && avSet.has('yatzy')) {
    return 'yatzy';
  }
  // 2. Large straight
  if (sorted === '23456' && avSet.has('largeStraight')) {
    return 'largeStraight';
  }
  // 3. Small straight (only if large isn't already filled by these dice)
  if (sorted === '12345' && avSet.has('smallStraight')) {
    return 'smallStraight';
  }
  // 4. Full house: prefer over upper if available
  const threeIdx = counts.findIndex(c => c >= 3);
  const twoIdx = counts.findIndex((c, i) => c >= 2 && i !== threeIdx);
  if (threeIdx !== -1 && twoIdx !== -1 && avSet.has('fullHouse')) {
    return 'fullHouse';
  }
  // 5. Four of a kind: prefer fourOfAKind slot if open
  const fourFace = counts.findIndex(c => c >= 4);
  if (fourFace !== -1 && avSet.has('fourOfAKind')) {
    return 'fourOfAKind';
  }

  return bestPlacementValue(dice, scores, available, bonus).catId;
}

// ─── Public: decide which dice to lock before reroll ─────

export function aiDecideLocks(
  dice: number[],
  scores: Record<string, number | null>,
  rollsLeft: number = 2,
): boolean[] {
  const available = availableList(scores);
  if (available.length === 0) return [false, false, false, false, false];

  const avSet = new Set<string>(available);
  const bonus = bonusInfo(scores, avSet);

  // Quick exit: completed yatzy → keep all
  const counts = getCounts(dice);
  if (counts.some(c => c === 5) && avSet.has('yatzy')) {
    return [true, true, true, true, true];
  }

  // Quick exit: completed large straight → keep all (unless we already used it)
  const sorted = [...dice].sort((a, b) => a - b).join('');
  if (sorted === '23456' && avSet.has('largeStraight')) {
    return [true, true, true, true, true];
  }
  if (sorted === '12345' && avSet.has('smallStraight') && !avSet.has('largeStraight')) {
    return [true, true, true, true, true];
  }
  // Completed full house with both slots open & no obvious better play
  const threeIdx = counts.findIndex(c => c >= 3);
  const twoIdx = counts.findIndex((c, i) => c >= 2 && i !== threeIdx);
  if (threeIdx !== -1 && twoIdx !== -1 && avSet.has('fullHouse')) {
    // Keep unless we have 4-of-a-kind and yatzy is open (then chase yatzy)
    if (!(counts[threeIdx] >= 4 && avSet.has('yatzy'))) {
      return [true, true, true, true, true];
    }
  }

  const candidates = generateCandidateLocks(dice, avSet);

  let bestLocks = candidates[0];
  let bestEV = -Infinity;
  for (const locks of candidates) {
    const ev = evaluateKeepEV(locks, dice, rollsLeft, scores, available, avSet, bonus);
    if (ev > bestEV) {
      bestEV = ev;
      bestLocks = locks;
    }
  }
  return bestLocks;
}
