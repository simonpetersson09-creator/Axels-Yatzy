// Exact optimal solitaire Yatzy (Scandinavian rules, 50-point bonus at 63).
// State = filled-category mask (15 bits, CATEGORIES order) × capped upper sum (0..63).
// The table holds the expected remaining score from each reachable state; a turn
// is then solved exactly against it. Dependency-free: shared by app and server.

export const CAT_IDS = [
  'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
  'pair', 'twoPairs', 'threeOfAKind', 'fourOfAKind',
  'smallStraight', 'largeStraight', 'fullHouse', 'chance', 'yatzy',
] as const;
export type OptCategory = typeof CAT_IDS[number];
const NC = 15;
const FULL = (1 << NC) - 1;

function scoreCounts(c: number[], cat: number): number {
  const sum = c[0] + 2 * c[1] + 3 * c[2] + 4 * c[3] + 5 * c[4] + 6 * c[5];
  if (cat < 6) return c[cat] * (cat + 1);
  switch (cat) {
    case 6: for (let i = 5; i >= 0; i--) if (c[i] >= 2) return (i + 1) * 2; return 0;
    case 7: { let n = 0, s = 0; for (let i = 5; i >= 0 && n < 2; i--) if (c[i] >= 2) { n++; s += (i + 1) * 2; } return n === 2 ? s : 0; }
    case 8: for (let i = 5; i >= 0; i--) if (c[i] >= 3) return (i + 1) * 3; return 0;
    case 9: for (let i = 5; i >= 0; i--) if (c[i] >= 4) return (i + 1) * 4; return 0;
    case 10: return c[0] && c[1] && c[2] && c[3] && c[4] ? 15 : 0;
    case 11: return c[1] && c[2] && c[3] && c[4] && c[5] ? 20 : 0;
    case 12: return c.includes(3) && c.includes(2) ? sum : 0;
    case 13: return sum;
    case 14: return c.includes(5) ? 50 : 0;
  }
  return 0;
}

// ─── Dice combinatorics ───
const keyOf = (c: number[]) => c[0] + 6 * c[1] + 36 * c[2] + 216 * c[3] + 1296 * c[4] + 7776 * c[5];
const keepCounts: number[][] = [];
const keepSize: number[] = [];
const keepByKey = new Int32Array(46656).fill(-1);
(function gen(i: number, left: number, cur: number[]) {
  if (i === 6) { keepByKey[keyOf(cur)] = keepCounts.length; keepCounts.push([...cur]); keepSize.push(5 - left); return; }
  for (let n = 0; n <= left; n++) { cur[i] = n; gen(i + 1, left - n, cur); }
  cur[i] = 0;
})(0, 5, [0, 0, 0, 0, 0, 0]);
const NK = keepCounts.length; // 462
// process keeps from 5 dice down to 0
const keepOrder = [...Array(NK).keys()].sort((a, b) => keepSize[b] - keepSize[a]);
const child = new Int32Array(NK * 6).fill(-1);
for (let k = 0; k < NK; k++) if (keepSize[k] < 5) for (let f = 0; f < 6; f++) {
  const c = [...keepCounts[k]]; c[f]++; child[k * 6 + f] = keepByKey[keyOf(c)];
}
const rolls = [...Array(NK).keys()].filter(k => keepSize[k] === 5); // 252
const NR = rolls.length;
const rollOfKeep = new Int32Array(NK).fill(-1);
rolls.forEach((k, r) => { rollOfKeep[k] = r; });
const subStart: number[] = []; const subList: number[] = [];
for (const k of rolls) {
  subStart.push(subList.length);
  const c = keepCounts[k];
  (function g(i: number, cur: number[]) {
    if (i === 6) { subList.push(keepByKey[keyOf(cur)]); return; }
    for (let n = 0; n <= c[i]; n++) { cur[i] = n; g(i + 1, cur); }
    cur[i] = 0;
  })(0, [0, 0, 0, 0, 0, 0]);
}
subStart.push(subList.length);
const scoreTab = new Int32Array(NR * NC);
rolls.forEach((k, r) => { for (let c = 0; c < NC; c++) scoreTab[r * NC + c] = scoreCounts(keepCounts[k], c); });

// Reachable capped upper sums per upper mask.
export const upperReach: Uint8Array[] = [];
for (let s = 0; s < 64; s++) {
  let reach = new Uint8Array(64); reach[0] = 1;
  for (let f = 0; f < 6; f++) if (s & (1 << f)) {
    const nx = new Uint8Array(64);
    for (let u = 0; u < 64; u++) if (reach[u]) for (let n = 0; n <= 5; n++) nx[Math.min(63, u + n * (f + 1))] = 1;
    reach = nx;
  }
  upperReach.push(reach);
}

// ─── Turn solving ───
type Lookup = (mask: number, u: number) => number;

function finalValues(mask: number, u: number, E: Lookup, out: Float64Array) {
  for (let r = 0; r < NR; r++) {
    let best = -1;
    for (let c = 0; c < NC; c++) {
      if (mask & (1 << c)) continue;
      const s = scoreTab[r * NC + c];
      let nu = u, b = 0;
      if (c < 6) { nu = Math.min(63, u + s); if (u < 63 && u + s >= 63) b = 50; }
      const v = s + b + E(mask | (1 << c), nu);
      if (v > best) best = v;
    }
    out[r] = best;
  }
}
function keepValues(V: Float64Array, kv: Float64Array) {
  for (const k of keepOrder) {
    if (keepSize[k] === 5) { kv[k] = V[rollOfKeep[k]]; continue; }
    const o = k * 6;
    kv[k] = (kv[child[o]] + kv[child[o + 1]] + kv[child[o + 2]] + kv[child[o + 3]] + kv[child[o + 4]] + kv[child[o + 5]]) / 6;
  }
}
function bestRoll(kv: Float64Array, out: Float64Array) {
  for (let r = 0; r < NR; r++) {
    let best = -1;
    for (let i = subStart[r]; i < subStart[r + 1]; i++) { const v = kv[subList[i]]; if (v > best) best = v; }
    out[r] = best;
  }
}
const EMPTY_KEEP = keepByKey[0];

/** Build the full table (minutes). Returns Float64 E indexed mask*64+u (unreachable = 0). */
export function buildTable(onProgress?: (mask: number) => void): Float64Array {
  const T = new Float64Array((FULL + 1) * 64);
  const E: Lookup = (m, u) => T[m * 64 + u];
  const V = new Float64Array(NR), kv = new Float64Array(NK);
  for (let mask = FULL - 1; mask >= 0; mask--) {
    const reach = upperReach[mask & 63];
    for (let u = 0; u < 64; u++) {
      if (!reach[u]) continue;
      finalValues(mask, u, E, V); keepValues(V, kv);
      bestRoll(kv, V); keepValues(V, kv);
      bestRoll(kv, V); keepValues(V, kv);
      T[mask * 64 + u] = kv[EMPTY_KEEP];
    }
    if (onProgress && (mask & 1023) === 0) onProgress(mask);
  }
  return T;
}

// ─── Compact encoding: reachable states in order, zigzag varint deltas of round(E*100) ───
export function encodeTable(T: Float64Array): Uint8Array {
  const out: number[] = []; let prev = 0;
  for (let mask = 0; mask <= FULL; mask++) { const reach = upperReach[mask & 63]; for (let u = 0; u < 64; u++) {
    if (!reach[u]) continue;
    const q = Math.round(T[mask * 64 + u] * 100); let d = q - prev; prev = q;
    let z = d >= 0 ? d * 2 : -d * 2 - 1;
    while (z >= 128) { out.push((z & 127) | 128); z = Math.floor(z / 128); }
    out.push(z);
  } }
  return Uint8Array.from(out);
}
export function decodeTable(bytes: Uint8Array): Float32Array {
  const T = new Float32Array((FULL + 1) * 64); let p = 0, prev = 0;
  for (let mask = 0; mask <= FULL; mask++) { const reach = upperReach[mask & 63]; for (let u = 0; u < 64; u++) {
    if (!reach[u]) continue;
    let z = 0, mul = 1, b: number;
    do { b = bytes[p++]; z += (b & 127) * mul; mul *= 128; } while (b & 128);
    prev += z & 1 ? -(z + 1) / 2 : z / 2;
    T[mask * 64 + u] = prev / 100;
  } }
  return T;
}
export function base64ToBytes(s: string): Uint8Array {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lut = new Int16Array(128).fill(-1); for (let i = 0; i < 64; i++) lut[A.charCodeAt(i)] = i;
  const clean = s.replace(/=+$/, ''); const out = new Uint8Array(Math.floor(clean.length * 3 / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = lut[clean.charCodeAt(i)], b = lut[clean.charCodeAt(i + 1)];
    const c = i + 2 < clean.length ? lut[clean.charCodeAt(i + 2)] : 0, d = i + 3 < clean.length ? lut[clean.charCodeAt(i + 3)] : 0;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    if (o < out.length) out[o++] = (n >> 16) & 255; if (o < out.length) out[o++] = (n >> 8) & 255; if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

// ─── Decisions from a decoded table ───
function stateOf(scores: Record<string, number | null>) {
  let mask = 0, u = 0;
  CAT_IDS.forEach((id, i) => { const s = scores[id]; if (s !== null && s !== undefined) { mask |= 1 << i; if (i < 6) u += s; } });
  return { mask, u: Math.min(63, u) };
}
function rollIndex(dice: number[]): number {
  const c = [0, 0, 0, 0, 0, 0]; for (const d of dice) c[d - 1]++;
  return rollOfKeep[keepByKey[keyOf(c)]];
}
const EPS = 1e-6;

export function createOptimalPlayer(T: Float32Array) {
  const E: Lookup = (m, u) => T[m * 64 + u];
  return {
    pickCategory(dice: number[], scores: Record<string, number | null>): OptCategory {
      const { mask, u } = stateOf(scores);
      const r = rollIndex(dice);
      let best = -1, bestC = -1;
      for (let c = 0; c < NC; c++) {
        if (mask & (1 << c)) continue;
        const s = scoreTab[r * NC + c]; let nu = u, b = 0;
        if (c < 6) { nu = Math.min(63, u + s); if (u < 63 && u + s >= 63) b = 50; }
        const v = s + b + E(mask | (1 << c), nu);
        if (v > best + EPS) { best = v; bestC = c; }
      }
      return CAT_IDS[bestC === -1 ? 13 : bestC];
    },
    decideLocks(dice: number[], scores: Record<string, number | null>, rollsLeft: number): boolean[] {
      const { mask, u } = stateOf(scores);
      if (mask === FULL || rollsLeft <= 0) return [true, true, true, true, true];
      const V = new Float64Array(NR), kv = new Float64Array(NK);
      finalValues(mask, u, E, V); keepValues(V, kv);
      if (rollsLeft >= 2) { bestRoll(kv, V); keepValues(V, kv); }
      const r = rollIndex(dice);
      // Highest value; ties go to keeping fewer dice (reroll rather than hold dead dice).
      let best = -1, bestK = EMPTY_KEEP;
      for (let i = subStart[r]; i < subStart[r + 1]; i++) {
        const k = subList[i], v = kv[k];
        if (v > best + EPS || (Math.abs(v - best) <= EPS && keepSize[k] < keepSize[bestK])) { best = v; bestK = k; }
      }
      const need = [...keepCounts[bestK]];
      return dice.map(d => { if (need[d - 1] > 0) { need[d - 1]--; return true; } return false; });
    },
    expected(scores: Record<string, number | null>): number { const { mask, u } = stateOf(scores); return E(mask, u); },
  };
}
export type OptimalPlayer = ReturnType<typeof createOptimalPlayer>;
