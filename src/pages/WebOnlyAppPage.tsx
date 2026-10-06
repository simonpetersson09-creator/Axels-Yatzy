import { useEffect } from 'react';
import { useTranslation } from '@/lib/i18n';
import { trackEvent } from '@/lib/analytics';
import { StoreButtons } from '@/components/StoreButtons';

/** Shown instead of the game on the public web: the game is iPhone-app only. */
export default function WebOnlyAppPage() {
  const { t } = useTranslation();

  useEffect(() => {
    trackEvent('web_blocked_shown');
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10 text-center gap-6">
      <div className="text-5xl">🎲</div>
      <div className="flex flex-col gap-2 max-w-sm">
        <h1 className="text-2xl font-display font-bold text-foreground">{t('webBlockTitle')}</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">{t('webBlockBody')}</p>
      </div>
      <StoreButtons onClick={(store) => trackEvent('web_blocked_download', { store })} />
    </div>
  );
}
