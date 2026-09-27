import { motion } from 'framer-motion';
import { Globe } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

const SEEN_KEY = 'mrbyatzy_online_news_seen_v1';

/** True once for players who already had games before online quick match existed. */
export function shouldShowOnlineNews(gamesPlayed: number): boolean {
  try {
    if (localStorage.getItem(SEEN_KEY)) return false;
    if (gamesPlayed <= 0) {
      // New player — they learn about it naturally; never show later.
      localStorage.setItem(SEEN_KEY, '1');
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function markOnlineNewsSeen() {
  try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* noop */ }
}

interface Props { onPlay: () => void; onClose: () => void }

export default function OnlineNewsPrompt({ onPlay, onClose }: Props) {
  const { t } = useTranslation();
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
            <Globe className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-lg font-display font-bold text-foreground">{t('onlineNewsTitle')}</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">{t('onlineNewsBody')}</p>
          <div className="w-full flex flex-col gap-2 mt-1">
            <motion.button onClick={onPlay} whileTap={{ scale: 0.97 }}
              className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-display font-bold text-sm">
              {t('onlineNewsOk')}
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
