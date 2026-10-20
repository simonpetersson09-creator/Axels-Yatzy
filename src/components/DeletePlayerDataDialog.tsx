import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n';
import { useBackHandler } from '@/lib/back-handler';
import { deletePlayerData } from '@/lib/delete-player-data';

export function DeletePlayerDataDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  const guard = useRef(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [done, setDone] = useState(false);
  const close = () => { if (!guard.current) onClose(); };
  useBackHandler(open, close);
  useEffect(() => {
    if (!open || !ref.current) return;
    setConfirmed(false); setError(false); setDone(false);
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, [open]);
  const erase = async () => {
    if (!confirmed || guard.current) return;
    guard.current = true; setBusy(true); setError(false);
    try { await deletePlayerData(); setDone(true); }
    catch { setError(true); }
    finally { guard.current = false; setBusy(false); }
  };
  if (!open) return null;
  return createPortal(
    <dialog ref={ref} aria-labelledby="delete-data-title" aria-describedby="delete-data-description"
      onCancel={e => { e.preventDefault(); if (!done) close(); }}
      className="fixed inset-0 m-auto w-[calc(100%-40px)] max-w-sm max-h-[calc(100dvh-80px)] overflow-y-auto rounded-lg border border-border bg-card p-5 text-foreground shadow-2xl backdrop:bg-background/80">
      <Trash2 className="mx-auto mb-3 h-8 w-8 text-destructive" />
      <h2 id="delete-data-title" className="text-center font-display text-lg font-bold">{t(done ? 'deleteDataDone' : 'deleteData')}</h2>
      <p id="delete-data-description" className="mt-3 text-sm leading-relaxed text-muted-foreground">{t(done ? 'deleteDataRestart' : 'deleteDataDescription')}</p>
      {done ? <Button className="mt-5 w-full" onClick={() => window.location.replace('/')}>{t('ok')}</Button> : <>
        <label className="mt-4 flex items-start gap-3 text-sm">
          <input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-destructive" />
          <span>{t('deleteDataAcknowledge')}</span>
        </label>
        {error && <p role="alert" className="mt-3 text-sm text-destructive">{t('deleteDataError')}</p>}
        <div className="mt-5 flex flex-col gap-2">
          <Button variant="destructive" disabled={!confirmed || busy} onClick={() => void erase()}>{t(busy ? 'loading' : 'deleteDataConfirm')}</Button>
          <Button variant="outline" disabled={busy} onClick={close}>{t('cancel')}</Button>
        </div>
      </>}
    </dialog>, document.body,
  );
}