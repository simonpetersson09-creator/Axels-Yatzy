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
  // Highest priority first — only one celebration shown per roll
  { type: 'fullHouse', category: 'fullHouse', duration: 4500 },
  { type: 'largeStraight', category: 'largeStraight', duration: 4500 },
  { type: 'fourOfAKind', category: 'fourOfAKind', duration: 4500 },
  { type: 'smallStraight', category: 'smallStraight', duration: 4500 },
  { type: 'threeOfAKind', category: 'threeOfAKind', duration: 4500, excludeIf: ['fourOfAKind', 'fullHouse'] },
];

// Must be >= dice ANIM_DURATION (1.05s) + max jitter (~0.05s) so the
// celebration only appears after the dice have visibly stopped spinning.
const DICE_LAND_DELAY_MS = 1150;

export function useCombinationCelebration(gameState: GameState | null) {
  const [activeCelebration, setActiveCelebration] = useState<CombinationType | null>(null);
  const prevIsRollingRef = useRef(false);
  const prevRollKeyRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    for (const check of COMBINATION_CHECKS) {
      const score = calculateScore(dice, check.category as any);
      if (score === 0) continue;
      if (currentPlayer.scores[check.category] != null) continue;

      if (check.excludeIf?.some(ex => calculateScore(dice, ex as any) > 0)) continue;

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (pendingRef.current) clearTimeout(pendingRef.current);

      // Wait for the dice to visibly stop spinning before celebrating.
      // For the explicit isRolling→false transition (local snabb match) the
      // dice have already landed; for key-based detection (multiplayer +
      // optimistic local) we delay until the dice animation finishes.
      const delay = isRollLanding ? 0 : DICE_LAND_DELAY_MS;
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
    };
  }, []);

  return activeCelebration;
}
