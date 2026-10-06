import { useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { trackEvent } from '@/lib/analytics';
import { StoreButtons } from '@/components/StoreButtons';

/** Landing page for shared invite links: download the app, then enter the code. */
export default function JoinPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const code = (params.get('code') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* noop */ }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10 text-center gap-6">
      <div className="text-5xl">🎲</div>
      <div className="flex flex-col gap-2 max-w-sm">
        <h1 className="text-2xl font-display font-bold text-foreground">{t('joinTitle')}</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">{t('joinBody')}</p>
      </div>

      {code && (
        <button
          onClick={copy}
          className="flex items-center gap-3 px-6 py-4 rounded-2xl bg-secondary border border-game-gold/30"
          aria-label={t('gameCode')}
        >
          <span className="font-display font-bold text-3xl tracking-[0.3em] text-game-gold">{code}</span>
          {copied ? <Check className="w-5 h-5 text-primary" /> : <Copy className="w-5 h-5 text-muted-foreground" />}
        </button>
      )}

      <StoreButtons onClick={(store) => trackEvent('join_page_download', { store })} />

      <div className="max-w-sm text-xs text-muted-foreground leading-relaxed">
        <p className="font-semibold text-foreground mb-1">{t('joinHaveApp')}</p>
        <p>{t('joinSteps')}</p>
      </div>
    </div>
  );
}
