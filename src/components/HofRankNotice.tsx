import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Trophy, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n';
import { useBackHandler } from '@/lib/back-handler';

/** Popup shown on app start when someone has passed the player in this week's top 10. */
export function HofRankNotice() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [dropped, setDropped] = useState<number | null | 'out' | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const open = dropped !== null;
  useBackHandler(open, () => setDropped(null));

  useEffect(() => {
    const h = (e: Event) => {
      const rank = (e as CustomEvent<{ rank: number | null }>).detail.rank;
      setDropped(rank === null ? 'out' : rank);
    };
    window.addEventListener('hof:dropped', h);
    return () => window.removeEventListener('hof:dropped', h);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    dialog.showModal();
    return () => { dialog.close(); };
  }, [open]);

  if (!open) return null;
  const close = () => setDropped(null);
  const show = () => { setDropped(null); navigate('/stats'); };
  return createPortal(
    <dialog ref={dialogRef} aria-labelledby="hof-drop-title"
      data-state="open" onCancel={(event) => { event.preventDefault(); close(); }}
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}
      className="fixed inset-0 m-auto w-[calc(100%-48px)] max-w-sm max-h-[calc(100dvh-96px)] overflow-y-auto rounded-lg border border-primary/40 bg-card p-6 text-foreground shadow-2xl backdrop:bg-background/70 backdrop:backdrop-blur-sm">
      <Button variant="ghost" size="icon" aria-label={t('close')} onClick={close} className="absolute right-2 top-2 text-muted-foreground">
        <X className="h-4 w-4" />
      </Button>
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
        <Trophy className="h-7 w-7" aria-hidden />
      </div>
      <h2 id="hof-drop-title" className="break-words text-center font-display text-lg font-bold">
        {dropped === 'out' ? t('hofDroppedOut') : t('hofDropped', { rank: dropped })}
      </h2>
      <div className="mt-6 flex gap-3">
        <Button variant="outline" onClick={close} className="flex-1">{t('ok')}</Button>
        <Button onClick={show} className="flex-1">{t('hofShow')}</Button>
      </div>
    </dialog>, document.body,
  );
}
