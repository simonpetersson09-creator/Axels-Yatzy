import { getUpperSectionTotal } from '@/lib/yatzy-scoring';
import type { LocalStats } from '@/lib/local-stats';

export type MatchHighlight =
  | { kind: 'newRecord'; score: number }
  | { kind: 'bonusGot'; upper: number }
  | { kind: 'bonusMissed'; missing: number }
  | { kind: 'yatzy' }
  | { kind: 'streak'; n: number }
  | { kind: 'toRecord'; n: number };

/** Player-0 highlights for the result box, compared with stats from before the match. Max four rows. */
export function getMatchHighlights(
  scores: Record<string, number | null>,
  total: number,
  won: boolean,
  before: LocalStats,
): MatchHighlight[] {
  const out: MatchHighlight[] = [];
  if (before.gamesPlayed > 0 && total > before.highScore) out.push({ kind: 'newRecord', score: total });
  const upper = getUpperSectionTotal(scores);
  if (upper >= 63) out.push({ kind: 'bonusGot', upper });
  else if (63 - upper <= 15) out.push({ kind: 'bonusMissed', missing: 63 - upper });
  if (scores.yatzy === 50) out.push({ kind: 'yatzy' });
  const streak = won ? before.currentStreak + 1 : 0;
  if (streak >= 2) out.push({ kind: 'streak', n: streak });
  if (before.gamesPlayed > 0 && total <= before.highScore) out.push({ kind: 'toRecord', n: before.highScore - total });
  return out.slice(0, 4);
}
