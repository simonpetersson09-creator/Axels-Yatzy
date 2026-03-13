export type CategoryId =
  | 'ones' | 'twos' | 'threes' | 'fours' | 'fives' | 'sixes'
  | 'pair' | 'twoPairs' | 'threeOfAKind' | 'fourOfAKind'
  | 'smallStraight' | 'largeStraight' | 'fullHouse' | 'chance' | 'yatzy';

export interface Category {
  id: CategoryId;
  name: string;
  section: 'upper' | 'lower';
}

export const CATEGORIES: Category[] = [
  { id: 'ones', name: 'Ettor', section: 'upper' },
  { id: 'twos', name: 'Tvåor', section: 'upper' },
  { id: 'threes', name: 'Treor', section: 'upper' },
  { id: 'fours', name: 'Fyror', section: 'upper' },
  { id: 'fives', name: 'Femmor', section: 'upper' },
  { id: 'sixes', name: 'Sexor', section: 'upper' },
  { id: 'pair', name: '1 par', section: 'lower' },
  { id: 'twoPairs', name: '2 par', section: 'lower' },
  { id: 'threeOfAKind', name: 'Triss', section: 'lower' },
  { id: 'fourOfAKind', name: 'Fyrtal', section: 'lower' },
  { id: 'smallStraight', name: 'Liten stege', section: 'lower' },
  { id: 'largeStraight', name: 'Stor stege', section: 'lower' },
  { id: 'fullHouse', name: 'Kåk', section: 'lower' },
  { id: 'chance', name: 'Chans', section: 'lower' },
  { id: 'yatzy', name: 'Yatzy', section: 'lower' },
];

export const UPPER_BONUS_THRESHOLD = 63;
export const UPPER_BONUS_VALUE = 50;

export interface PlayerScore {
  [key: string]: number | null;
}

export interface Player {
  id: string;
  name: string;
  scores: PlayerScore;
}

export interface GameState {
  players: Player[];
  currentPlayerIndex: number;
  dice: number[];
  lockedDice: boolean[];
  rollsLeft: number;
  isRolling: boolean;
  gameOver: boolean;
  round: number;
}

export interface PlayerStats {
  gamesPlayed: number;
  wins: number;
  highScore: number;
  totalScore: number;
  yatzyCount: number;
}
