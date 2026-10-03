import { useState } from 'react';
import { motion } from 'framer-motion';
import { Gift } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/i18n';
import { claimWithCode, markReferralAsked } from '@/lib/referral';
import { trackEvent } from '@/lib/analytics';

/** Shown once to brand-new installs that couldn't be matched automatically. */
export default function ReferralAskPrompt({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => { markReferralAsked(); onClose(); };

  const submit = async () => {
    const c = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (c.length < 4 || busy) return;
    setBusy(true);
    const res = await claimWithCode(c);
    setBusy(false);
    if (res.matched) {
      trackEvent('referral_manual_matched');
      toast.success(t('refAskThanks'));
      close();
    } else {
      toast.error(t('refAskInvalid'));
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-5 pb-8 bg-background/70 backdrop-blur-sm"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <motion.div
        role="dialog" aria-modal="true"
        className="w-full max-w-sm rounded-3xl bg-secondary border border-game-gold/30 p-5 text-center game-shadow-soft"
        initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary/15 flex items-center justify-center">
            <Gift className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-lg font-display font-bold text-foreground">{t('refAskTitle')}</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">{t('refAskBody')}</p>
          <input
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase().slice(0, 8))}
            placeholder={t('refAskPlaceholder')}
            autoCapitalize="characters"
            className="w-full text-center tracking-[0.25em] font-display font-bold text-lg py-3 rounded-2xl bg-background border border-border text-foreground placeholder:text-muted-foreground placeholder:tracking-normal placeholder:text-sm placeholder:font-normal"
          />
          <div className="w-full flex flex-col gap-2 mt-1">
            <motion.button onClick={submit} disabled={busy || code.length < 4} whileTap={{ scale: 0.97 }}
              className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-display font-bold text-sm disabled:opacity-50">
              {t('refAskSubmit')}
            </motion.button>
            <motion.button onClick={close} whileTap={{ scale: 0.97 }}
              className="w-full py-2.5 rounded-2xl text-muted-foreground text-xs font-semibold">
              {t('refAskSkip')}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
