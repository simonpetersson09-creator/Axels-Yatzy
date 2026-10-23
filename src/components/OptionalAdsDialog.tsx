import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n';
import { useBackHandler } from '@/lib/back-handler';

export function OptionalAdsDialog({ open, onClose, onStart }: {
  open: boolean; onClose: () => void; onStart: () => void;
}) {
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
  return createPortal(<dialog ref={ref} aria-labelledby="optional-ads-title"
    onCancel={e => { e.preventDefault(); onClose(); }}
    className="fixed inset-0 m-auto w-[calc(100%-48px)] max-w-sm max-h-[calc(100dvh-96px)] overflow-y-auto rounded-lg border border-border bg-card p-6 text-foreground shadow-2xl backdrop:bg-background/70">
    <h2 id="optional-ads-title" className="font-display text-lg font-bold">{t('adPairTitle')}</h2>
    <p className="mt-3 text-sm text-muted-foreground">{t('adPairBody')}</p>
    <div className="mt-6 flex flex-col gap-2">
      <Button onClick={onStart}><Play />{t('adPairStart')}</Button>
      <Button variant="ghost" onClick={onClose}>{t('cancel')}</Button>
    </div>
  </dialog>, document.body);
}