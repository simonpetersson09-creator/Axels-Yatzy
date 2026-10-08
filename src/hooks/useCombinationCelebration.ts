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

export function useCombinationCelebration(gameState: GameState | null) {
  const [activeCelebration, setActiveCelebration] = useState<CombinationType | null>(null);
  const [yatzyTrigger, setYatzyTrigger] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const yatzyPendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef<GameState | null>(gameState);
  stateRef.current = gameState;
  const celebratedKeyRef = useRef<string | null>(null);

  // React the moment the dice have visibly come to rest on screen (the dice
  // engine fires `dice:landed`), never on a timer — so the banner neither
  // beats slow server dice nor lags behind fast ones.
  useEffect(() => {
    const onLanded = () => {
      const gs = stateRef.current;
      if (!gs || gs.rollsLeft >= 3) return;
      const dice = gs.dice;
      const rollKey = `${gs.currentPlayerIndex}:${gs.round}:${gs.rollsLeft}:${dice.join(',')}`;
      if (celebratedKeyRef.current === rollKey) return;
      celebratedKeyRef.current = rollKey;
      const currentPlayer = gs.players[gs.currentPlayerIndex];
      if (!currentPlayer) return;

      // Yatzy (5-of-a-kind) gets its own dedicated celebration, always.
      const isYatzy = dice.length === 5 && dice.every(d => d === dice[0]) && dice[0] !== 0;
      if (isYatzy) {
        setYatzyTrigger(t => t + 1);
        return;
      }

      for (const check of COMBINATION_CHECKS) {
        const score = calculateScore(dice, check.category as any);
        if (score === 0) continue;
        if (currentPlayer.scores[check.category] != null) continue;
        if (check.excludeIf?.some(ex => calculateScore(dice, ex as any) > 0)) continue;

        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setActiveCelebration(check.type);
        timeoutRef.current = setTimeout(() => setActiveCelebration(null), check.duration);
        break;
      }
    };
    window.addEventListener('dice:landed', onLanded);
    return () => window.removeEventListener('dice:landed', onLanded);
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (pendingRef.current) clearTimeout(pendingRef.current);
      if (yatzyPendingRef.current) clearTimeout(yatzyPendingRef.current);
    };
  }, []);

  return { activeCelebration, yatzyTrigger };
}
