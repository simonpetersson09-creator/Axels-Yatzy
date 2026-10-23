import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n';
import { useBackHandler } from '@/lib/back-handler';

export function WaitingRoomChoiceDialog({ open, mode, busy = false, onClose, onConfirm, onSecondary }: {
  open: boolean; mode: 'enter' | 'exit' | 'leave'; busy?: boolean;
  onClose: () => void; onConfirm: () => void; onSecondary: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  useBackHandler(open, () => { if (!busy) onClose(); });
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, [open]);
  if (!open) return null;
  return createPortal(<dialog ref={ref} aria-labelledby={`waiting-choice-${mode}`}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    className="fixed inset-0 m-auto w-[calc(100%-40px)] max-w-sm max-h-[calc(100dvh-80px)] overflow-y-auto rounded-lg border border-border bg-card p-6 text-foreground shadow-2xl backdrop:bg-background/80">
    <h2 id={`waiting-choice-${mode}`} className="font-display text-xl font-bold">{t(mode === 'enter' ? 'wrEnterQuestion' : mode === 'exit' ? 'wrExitQuestion' : 'wrLeaveQuestion')}</h2>
    <div className="mt-6 flex flex-col gap-3">
      <Button className="h-auto min-h-11 whitespace-normal" disabled={busy} onClick={onConfirm}>{t(mode === 'enter' ? 'wrJoin' : mode === 'exit' ? 'wrKeepSeat' : 'wrLeaveConfirm')}</Button>
      <Button variant="secondary" className="h-auto min-h-11 whitespace-normal" disabled={busy} onClick={onSecondary}>{t(mode === 'enter' ? 'cancel' : mode === 'exit' ? 'wrLeave' : 'wrKeepSeat')}</Button>
    </div>
  </dialog>, document.body);
}