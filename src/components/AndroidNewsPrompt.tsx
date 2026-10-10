import { motion } from 'framer-motion';
import { Smartphone } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/i18n';
import { PLAY_STORE_LIVE, PLAY_STORE_URL } from '@/lib/app-links';
import { trackEvent } from '@/lib/analytics';

const SEEN_KEY = 'mrbyatzy_android_news_seen_v1';

/** One-time news for non-Android players: the app is now on Google Play. */
export function shouldShowAndroidNews(): boolean {
  try {
    if (!PLAY_STORE_LIVE || Capacitor.getPlatform() === 'android') return false;
    return !localStorage.getItem(SEEN_KEY);
  } catch {
    return false;
  }
}

export function markAndroidNewsSeen() {
  try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* noop */ }
}

export default function AndroidNewsPrompt({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();

  const share = async () => {
    const text = `${t('androidNewsShareText')}\n${PLAY_STORE_URL}`;
    trackEvent('android_news_share');
    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share({ title: 'Mr.B. Yatzy', text, url: PLAY_STORE_URL });
      } else if (navigator.share) {
        await navigator.share({ title: 'Mr.B. Yatzy', text, url: PLAY_STORE_URL });
      } else {
        await navigator.clipboard.writeText(text);
        toast.success(PLAY_STORE_URL);
      }
    } catch { /* cancelled */ }
    onClose();
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-5 pb-8 bg-background/70 backdrop-blur-sm"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}
        className="w-full max-w-sm rounded-3xl bg-secondary border border-game-gold/30 p-5 text-center game-shadow-soft"
        initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16 }}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary/15 flex items-center justify-center">
            <Smartphone className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-lg font-display font-bold text-foreground">{t('androidNewsTitle')}</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">{t('androidNewsBody')}</p>
          <div className="w-full flex flex-col gap-2 mt-1">
            <motion.button onClick={share} whileTap={{ scale: 0.97 }}
              className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-display font-bold text-sm">
              {t('androidNewsShare')}
            </motion.button>
            <motion.button onClick={onClose} whileTap={{ scale: 0.97 }}
              className="w-full py-2.5 rounded-2xl text-muted-foreground text-xs font-semibold">
              OK
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
