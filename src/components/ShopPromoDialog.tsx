import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n';
import { useBackHandler } from '@/lib/back-handler';

export function ShopPromoDialog({ open, onClose, onShop }: { open: boolean; onClose: () => void; onShop: () => void }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  useBackHandler(open, onClose);
  useEffect(() => {
    const d = ref.current;
    if (!open || !d) return;
    d.showModal();
    return () => d.close();
  }, [open]);
  if (!open) return null;
  return createPortal(<dialog ref={ref} aria-labelledby="shop-promo-title"
    onCancel={e => { e.preventDefault(); onClose(); }}
    className="fixed inset-0 m-auto w-[calc(100%-48px)] max-w-sm max-h-[calc(100dvh-96px)] overflow-y-auto rounded-lg border border-border bg-card p-6 text-foreground shadow-2xl backdrop:bg-background/70">
    <h2 id="shop-promo-title" className="font-display text-lg font-bold">{t('shopPromoTitle')}</h2>
    <p className="mt-3 text-sm text-muted-foreground">{t('shopPromoBody')}</p>
    <div className="mt-6 flex flex-col gap-2">
      <Button onClick={onShop}><Store />{t('shopPromoButton')}</Button>
      <Button variant="ghost" onClick={onClose}>{t('shopPromoLater')}</Button>
    </div>
  </dialog>, document.body);
}
