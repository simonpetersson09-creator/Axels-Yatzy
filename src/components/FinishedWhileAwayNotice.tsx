import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n';
import { useBackHandler } from '@/lib/back-handler';
import { supabase } from '@/integrations/supabase/client';
import { getTotalScore } from '@/lib/yatzy-scoring';
import { getMatchStandings } from '@/lib/match-standings';
import { usePostMatchExit } from '@/hooks/usePostMatchExit';
import { getSessionId } from '@/lib/session';
import { recordFinishedOnlineResult } from '@/lib/record-online-result';

let openCount = 0;
/** Home's reopen ad waits while this notice owns the post-match ad. */
export const isFinishedNoticeOpen = () => openCount > 0;

interface Row { name: string; score: number; index: number }

/** Online match that ended while this player was away: result + "Till startsidan" → post-match ad. */
export default function FinishedWhileAwayNotice({ gameId, onDone }: { gameId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [forfeitName, setForfeitName] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { leaving, leave } = usePostMatchExit(`online:${gameId}`, true, onDone);

  useEffect(() => {
    openCount++;
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => { openCount--; dialog?.close(); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [g, p] = await Promise.all([
        supabase.from('games').select('forfeited_by, forfeited_by_session_id').eq('id', gameId).maybeSingle(),
        supabase.from('game_players').select('player_name, player_index, scores, session_id').eq('game_id', gameId),
      ]);
      if (cancelled) return;
      if (p.error || !p.data) { setRows([]); return; }
      setForfeitName(g.data?.forfeited_by ?? null);
      if (!g.error && g.data) {
        recordFinishedOnlineResult(gameId, getSessionId(), p.data.map(r => {
          const sc = (r.scores ?? {}) as Record<string, number | null>;
          return { session_id: r.session_id, score: getTotalScore(sc), yatzy: sc.yatzy === 50 };
        }), !!g.data.forfeited_by || !!g.data.forfeited_by_session_id);
      }
      setRows(p.data
        .sort((a, b) => a.player_index - b.player_index)
        .map(r => ({ name: r.player_name, index: r.player_index, score: getTotalScore((r.scores ?? {}) as Record<string, number | null>) })));
    })();
    return () => { cancelled = true; };
  }, [gameId]);

  useBackHandler(true, () => { void leave(); });

  const standings = rows ? getMatchStandings(rows) : [];
  const top = standings[0]?.player.score;
  const winners = standings.filter(s => s.player.score === top);
  const title = forfeitName ? `${forfeitName} ${t('forfeited')}`
    : winners.length > 1 ? t('friendsDraw') : winners[0] ? t('playerWins', { name: winners[0].player.name }) : t('matchEnded');

  return createPortal(
    <dialog ref={dialogRef} aria-labelledby="finished-away-title"
      onCancel={event => { event.preventDefault(); void leave(); }}
      className="fixed inset-0 m-auto w-[calc(100%-48px)] max-w-sm max-h-[calc(100dvh-96px)] overflow-y-auto rounded-lg border border-primary/40 bg-card p-6 text-foreground text-center shadow-2xl backdrop:bg-background/70 backdrop:backdrop-blur-sm space-y-4">
      <Trophy className="mx-auto h-10 w-10 text-game-gold" aria-hidden />
      <p className="text-sm text-muted-foreground">{t('matchEnded')}</p>
      <h2 id="finished-away-title" className="font-display text-xl font-bold">{title}</h2>
      <div className="space-y-2">
        {standings.map(s => (
          <div key={s.player.index} className="flex items-center justify-between rounded-md bg-secondary/40 px-3 py-2">
            <span className="font-semibold truncate">{s.rank}. {s.player.name}</span>
            <span className="font-display font-bold text-primary">{s.player.score}</span>
          </div>
        ))}
      </div>
      <Button className="w-full" disabled={leaving || rows === null} onClick={() => { void leave(); }}>{t('toHome')}</Button>
    </dialog>, document.body,
  );
}
