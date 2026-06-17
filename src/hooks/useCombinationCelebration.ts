import { useState, useRef, useEffect } from 'react';
import { GameState } from '@/types/yatzy';
import { calculateScore } from '@/lib/yatzy-scoring';
import { CombinationType } from '@/components/game/CombinationCelebration';

// Priority order: highest-value combination wins if multiple match
const COMBINATION_CHECKS: {
  type: CombinationType;
  category: string;
  duration: number;
  excludeIf?: string[];
}[] = [
  // Highest priority first — only one celebration shown per roll.
  // Yatzy has its own dedicated celebration (YatzyCelebration), so any
  // combination that would also trigger on 5-of-a-kind must exclude 'yatzy'
  // to avoid showing e.g. "Fyrtal" when the player actually rolled a Yatzy.
  { type: 'fullHouse', category: 'fullHouse', duration: 4500, excludeIf: ['yatzy'] },
  { type: 'largeStraight', category: 'largeStraight', duration: 4500, excludeIf: ['yatzy'] },
  { type: 'fourOfAKind', category: 'fourOfAKind', duration: 4500, excludeIf: ['yatzy'] },
  { type: 'smallStraight', category: 'smallStraight', duration: 4500, excludeIf: ['yatzy'] },
  { type: 'threeOfAKind', category: 'threeOfAKind', duration: 4500, excludeIf: ['fourOfAKind', 'fullHouse', 'yatzy'] },
];

// Must be >= dice ANIM_DURATION (1.05s) + max jitter (~0.05s) so the
// celebration only appears after the dice have visibly stopped spinning.
const DICE_LAND_DELAY_MS = 1150;

export function useCombinationCelebration(gameState: GameState | null) {
  const [activeCelebration, setActiveCelebration] = useState<CombinationType | null>(null);
  const [yatzyTrigger, setYatzyTrigger] = useState(0);
  const prevIsRollingRef = useRef(false);
  const prevRollKeyRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const yatzyPendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!gameState) return;

    const wasRolling = prevIsRollingRef.current;
    prevIsRollingRef.current = gameState.isRolling;

    const rollKey = `${gameState.currentPlayerIndex}:${gameState.round}:${gameState.rollsLeft}:${gameState.dice.join(',')}`;
    const prevKey = prevRollKeyRef.current;
    prevRollKeyRef.current = rollKey;

    const isRollLanding = wasRolling && !gameState.isRolling;

    const isNewRoll = prevKey !== null && prevKey !== rollKey
      && gameState.rollsLeft < 3
      && gameState.dice.some(d => d !== 1);

    if (!isRollLanding && !isNewRoll) return;

    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    const dice = gameState.dice;
    const delay = isRollLanding ? 0 : DICE_LAND_DELAY_MS;

    // Yatzy (5-of-a-kind) gets its own dedicated celebration. Trigger it on
    // dice landing, regardless of whether the yatzy slot is already filled —
    // rolling a yatzy is always worth celebrating.
    const isYatzy = dice.length === 5 && dice.every(d => d === dice[0]) && dice[0] !== 0;
    if (isYatzy) {
      if (yatzyPendingRef.current) clearTimeout(yatzyPendingRef.current);
      yatzyPendingRef.current = setTimeout(() => {
        setYatzyTrigger(t => t + 1);
      }, delay);
      return;
    }

    for (const check of COMBINATION_CHECKS) {
      const score = calculateScore(dice, check.category as any);
      if (score === 0) continue;
      if (currentPlayer.scores[check.category] != null) continue;

      if (check.excludeIf?.some(ex => calculateScore(dice, ex as any) > 0)) continue;

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (pendingRef.current) clearTimeout(pendingRef.current);

      pendingRef.current = setTimeout(() => {
        setActiveCelebration(check.type);
        timeoutRef.current = setTimeout(() => setActiveCelebration(null), check.duration);
      }, delay);
      break;
    }
  }, [
    gameState?.isRolling,
    gameState?.currentPlayerIndex,
    gameState?.round,
    gameState?.rollsLeft,
    gameState?.dice.join(','),
  ]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (pendingRef.current) clearTimeout(pendingRef.current);
      if (yatzyPendingRef.current) clearTimeout(yatzyPendingRef.current);
    };
  }, []);

  return { activeCelebration, yatzyTrigger };
}
