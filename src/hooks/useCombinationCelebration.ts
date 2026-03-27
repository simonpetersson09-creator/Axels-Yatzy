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
  { type: 'fullHouse', category: 'fullHouse', duration: 1400 },
  { type: 'largeStraight', category: 'largeStraight', duration: 1300 },
  { type: 'fourOfAKind', category: 'fourOfAKind', duration: 1200 },
  { type: 'smallStraight', category: 'smallStraight', duration: 1100 },
  { type: 'threeOfAKind', category: 'threeOfAKind', duration: 900, excludeIf: ['fourOfAKind', 'fullHouse'] },
];

export function useCombinationCelebration(gameState: GameState | null) {
  const [activeCelebration, setActiveCelebration] = useState<CombinationType | null>(null);
  const prevIsRollingRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!gameState) return;
    const wasRolling = prevIsRollingRef.current;
    prevIsRollingRef.current = gameState.isRolling;

    if (!wasRolling || gameState.isRolling) return;

    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    const dice = gameState.dice;

    // Find highest-priority matching combination
    for (const check of COMBINATION_CHECKS) {
      const score = calculateScore(dice, check.category as any);
      if (score === 0) continue;
      if (currentPlayer.scores[check.category] != null) continue;

      // Skip if a higher combo also matches (e.g. skip triss when fyrtal exists)
      if (check.excludeIf?.some(ex => calculateScore(dice, ex as any) > 0)) continue;

      // Clear any existing timeout
      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      setActiveCelebration(check.type);
      timeoutRef.current = setTimeout(() => setActiveCelebration(null), check.duration);
      break; // Only show one celebration
    }
  }, [gameState?.isRolling]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return activeCelebration;
}
