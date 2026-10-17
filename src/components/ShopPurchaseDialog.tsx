import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n';
import { useBackHandler } from '@/lib/back-handler';

export function ShopPurchaseDialog({ purchase, xp, onClose }: {
  purchase: { name: string; price: number } | null;
  xp: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);
  useBackHandler(purchase !== null, onClose);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!purchase || !dialog) return;
    dialog.showModal();
    okRef.current?.focus();
    return () => { dialog.close(); };
  }, [purchase]);

  if (!purchase) return null;
  return createPortal(
    <dialog ref={dialogRef} aria-labelledby="shop-purchase-title" aria-describedby="shop-purchase-balance"
      data-state="open" onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      className="fixed inset-0 m-auto w-[calc(100%-48px)] max-w-sm max-h-[calc(100dvh-96px)] overflow-y-auto rounded-lg border border-primary/40 bg-card p-6 text-foreground shadow-2xl backdrop:bg-background/70 backdrop:backdrop-blur-sm">
      <Button variant="ghost" size="icon" aria-label={t('close')} onClick={onClose} className="absolute right-2 top-2 text-muted-foreground">
        <X className="h-4 w-4" />
      </Button>
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
        <Check className="h-7 w-7" aria-hidden />
      </div>
      <h2 id="shop-purchase-title" className="break-words text-center font-display text-lg font-bold">
        {t('shopBought', { name: purchase.name })}
      </h2>
      <p id="shop-purchase-balance" className="mt-3 text-center text-sm font-semibold text-primary">
        −{purchase.price} XP · {t('shopWallet', { n: xp })}
      </p>
      <Button ref={okRef} onClick={onClose} className="mt-6 w-full">{t('ok')}</Button>
    </dialog>, document.body,
  );
}