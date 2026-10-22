import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n';
import { useBackHandler } from '@/lib/back-handler';

export function WaitingRoomWelcomeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  useBackHandler(open, onClose);
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, [open]);
  if (!open) return null;
  return createPortal(<dialog ref={ref} aria-labelledby="waiting-welcome-title" aria-describedby="waiting-welcome-body"
    onCancel={e => { e.preventDefault(); onClose(); }}
    className="fixed inset-0 m-auto w-[calc(100%-40px)] max-w-sm max-h-[calc(100dvh-80px)] overflow-y-auto rounded-lg border border-border bg-card p-6 text-foreground shadow-2xl backdrop:bg-background/80">
    <h2 id="waiting-welcome-title" className="font-display text-xl font-bold">{t('wrChatWelcome')} {t('wrTitle')}</h2>
    <p id="waiting-welcome-body" className="mt-4 text-sm leading-relaxed text-muted-foreground">{t('wrWelcomeBody')}</p>
    <Button className="mt-6 w-full" onClick={onClose}>{t('ok')}</Button>
  </dialog>, document.body);
}