import { useEffect } from 'react';
import { useTranslation } from '@/lib/i18n';
import { trackEvent } from '@/lib/analytics';
import { APP_STORE_URL } from '@/lib/app-links';

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
      <a
        href={APP_STORE_URL}
        onClick={() => trackEvent('web_blocked_download')}
        className="w-full max-w-sm py-4 rounded-2xl bg-primary text-primary-foreground font-display font-bold text-base shadow-[0_4px_16px_hsl(36_78%_55%/0.3)]"
      >
        {t('joinDownload')}
      </a>
    </div>
  );
}
