import { CATEGORIES, type CategoryId, type GameState } from '@/types/yatzy';

/** Independent arithmetic oracle, deliberately not the production scoring function. */
export function referenceScore(dice: number[], category: CategoryId): number {
  const counts = Array.from({ length: 7 }, (_, n) => dice.filter(d => d === n).length);
  const face = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'].indexOf(category) + 1;
  if (face > 0) return face * counts[face];
  const values = [6, 5, 4, 3, 2, 1];
  const pair = values.filter(n => counts[n] >= 2);
  switch (category) {
    case 'pair': return (pair[0] ?? 0) * 2;
    case 'twoPairs': return pair.length >= 2 ? (pair[0] + pair[1]) * 2 : 0;
    case 'threeOfAKind': return (values.find(n => counts[n] >= 3) ?? 0) * 3;
    case 'fourOfAKind': return (values.find(n => counts[n] >= 4) ?? 0) * 4;
    case 'smallStraight': return [1, 2, 3, 4, 5].every(n => counts[n] === 1) ? 15 : 0;
    case 'largeStraight': return [2, 3, 4, 5, 6].every(n => counts[n] === 1) ? 20 : 0;
    case 'fullHouse': return counts.includes(3) && counts.includes(2) ? dice.reduce((a, b) => a + b, 0) : 0;
    case 'chance': return dice.reduce((a, b) => a + b, 0);
    case 'yatzy': return counts.includes(5) ? 50 : 0;
  }
}

export function referenceTotal(scores: Record<string, number | null>): number {
  const upper = CATEGORIES.filter(c => c.section === 'upper').reduce((sum, c) => sum + (scores[c.id] ?? 0), 0);
  return Object.values(scores).reduce((sum: number, score) => sum + (score ?? 0), 0) + (upper >= 63 ? 50 : 0);
}

export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
}

export function assertComplete(state: GameState) {
  if (!state.gameOver) throw new Error('Match did not finish');
  for (const player of state.players) {
    if (CATEGORIES.some(c => player.scores[c.id] == null)) throw new Error('Missing final category');
    if (Object.keys(player.scores).length !== 15) throw new Error('Unexpected scored category count');
    if (Object.values(player.scores).some(s => typeof s !== 'number' || !Number.isInteger(s) || s < 0)) throw new Error('Invalid final score');
  }
}