import { CategoryId } from '@/types/yatzy';

function getCounts(dice: number[]): number[] {
  const counts = [0, 0, 0, 0, 0, 0];
  dice.forEach(d => counts[d - 1]++);
  return counts;
}

function sumOf(dice: number[], value: number): number {
  return dice.filter(d => d === value).reduce((a, b) => a + b, 0);
}

function nOfAKind(dice: number[], n: number): number {
  const counts = getCounts(dice);
  for (let i = 5; i >= 0; i--) {
    if (counts[i] >= n) return (i + 1) * n;
  }
  return 0;
}

export function calculateScore(dice: number[], category: CategoryId): number {
  const counts = getCounts(dice);
  const sorted = [...dice].sort((a, b) => a - b);
  const sum = dice.reduce((a, b) => a + b, 0);

  switch (category) {
    case 'ones': return sumOf(dice, 1);
    case 'twos': return sumOf(dice, 2);
    case 'threes': return sumOf(dice, 3);
    case 'fours': return sumOf(dice, 4);
    case 'fives': return sumOf(dice, 5);
    case 'sixes': return sumOf(dice, 6);

    case 'pair': {
      for (let i = 5; i >= 0; i--) {
        if (counts[i] >= 2) return (i + 1) * 2;
      }
      return 0;
    }

    case 'twoPairs': {
      const pairs: number[] = [];
      for (let i = 5; i >= 0; i--) {
        if (counts[i] >= 4) {
          // Four of a kind counts as two pairs of the same value
          pairs.push(i + 1);
          pairs.push(i + 1);
        } else if (counts[i] >= 2) {
          pairs.push(i + 1);
        }
      }
      if (pairs.length >= 2) return pairs[0] * 2 + pairs[1] * 2;
      return 0;
    }

    case 'threeOfAKind': return nOfAKind(dice, 3);

    case 'fourOfAKind': return nOfAKind(dice, 4);

    case 'smallStraight': {
      if (sorted.join('') === '12345') return 15;
      return 0;
    }

    case 'largeStraight': {
      if (sorted.join('') === '23456') return 20;
      return 0;
    }

    case 'fullHouse': {
      const hasThree = counts.some(c => c === 3);
      const hasTwo = counts.some(c => c === 2);
      if (hasThree && hasTwo) return sum;
      return 0;
    }

    case 'chance': return sum;

    case 'yatzy': {
      if (counts.some(c => c === 5)) return 50;
      return 0;
    }

    default: return 0;
  }
}

export function getUpperSectionTotal(scores: Record<string, number | null>): number {
  const upperCats: CategoryId[] = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
  return upperCats.reduce((sum, cat) => sum + (scores[cat] ?? 0), 0);
}

export function getTotalScore(scores: Record<string, number | null>): number {
  const upperTotal = getUpperSectionTotal(scores);
  const bonus = upperTotal >= 63 ? 50 : 0;
  const allScores = Object.values(scores).reduce((sum: number, s) => sum + (s ?? 0), 0);
  return allScores + bonus;
}

export function rollDice(current: number[], locked: boolean[]): number[] {
  return current.map((val, i) => locked[i] ? val : Math.floor(Math.random() * 6) + 1);
}
