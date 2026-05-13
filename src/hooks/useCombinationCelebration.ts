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

export function useCombinationCelebration(gameState: GameState | null) {
  const [activeCelebration, setActiveCelebration] = useState<CombinationType | null>(null);
  const prevIsRollingRef = useRef(false);
  const prevRollKeyRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!gameState) return;

    // Two trigger paths so this works in both Snabb match (driven by
    // gameState.isRolling) and multiplayer (server is_rolling is always
    // false — instead we observe that a fresh roll landed by tracking
    // currentPlayerIndex + round + rollsLeft + dice).
    const wasRolling = prevIsRollingRef.current;
    prevIsRollingRef.current = gameState.isRolling;

    const rollKey = `${gameState.currentPlayerIndex}:${gameState.round}:${gameState.rollsLeft}:${gameState.dice.join(',')}`;
    const prevKey = prevRollKeyRef.current;
    prevRollKeyRef.current = rollKey;

    const isRollLanding = !wasRolling && !gameState.isRolling
      ? false // fall through to key-based detection
      : (wasRolling && !gameState.isRolling);

    // Skip on first observation to avoid firing on initial load / rejoin.
    const isNewRoll = prevKey !== null && prevKey !== rollKey
      && gameState.rollsLeft < 3
      && gameState.dice.some(d => d !== 1); // ignore the reset-to-[1,1,1,1,1]

    if (!isRollLanding && !isNewRoll) return;

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
    };
  }, []);

  return activeCelebration;
}
