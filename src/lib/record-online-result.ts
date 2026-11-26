import { recordGameResult } from '@/lib/local-stats';
import { trackFinishedEvent } from '@/lib/finished-event';

interface P { session_id: string; score: number; yatzy: boolean }

/**
 * Counts a finished online match in this phone's statistics exactly once
 * (same `mp:<id>` key as the in-match path). Forfeits never count.
 */
export function recordFinishedOnlineResult(gameId: string, mySessionId: string, players: P[], forfeited: boolean): boolean {
  const me = players.find(p => p.session_id === mySessionId);
  if (!me || forfeited) return false;
  const top = Math.max(...players.map(p => p.score));
  const isDraw = players.filter(p => p.score === top && top > 0).length > 1;
  const won = !isDraw && me.score === top && me.score > 0;
  const recorded = recordGameResult(me.score, won, me.yatzy ? 1 : 0, `mp:${gameId}`);
  if (recorded) {
    try { localStorage.setItem(`stats-recorded:${gameId}`, '1'); } catch { /* ledger still protects it */ }
    trackFinishedEvent(`mp:${gameId}`, { won, draw: isDraw, score: me.score, forfeit: false }, { gameId, gameMode: 'multiplayer' });
  }
  return recorded;
}
