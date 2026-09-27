import { motion } from 'framer-motion';
import { Heart } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

const LAST_KEY = 'mrbyatzy_daily_ad_prompt_v1';
const FIRST_SEEN_KEY = 'mrbyatzy_first_launch_day_v1';

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Max once per calendar day, never on the player's first day. */
export function shouldShowDailyAdPrompt(): boolean {
  try {
    const day = today();
    const first = localStorage.getItem(FIRST_SEEN_KEY);
    if (!first) { localStorage.setItem(FIRST_SEEN_KEY, day); return false; }
    if (first === day) return false;
    return localStorage.getItem(LAST_KEY) !== day;
  } catch {
    return false;
  }
}

export function markDailyAdPromptShown() {
  try { localStorage.setItem(LAST_KEY, today()); } catch { /* noop */ }
}

interface Props { onYes: () => void; onNo: () => void }

export default function DailyAdPrompt({ onYes, onNo }: Props) {
  const { t } = useTranslation();
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-5 pb-8 bg-background/70 backdrop-blur-sm"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onNo}
    >
      <motion.div
        role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}
        className="w-full max-w-sm rounded-3xl bg-secondary border border-game-gold/30 p-5 text-center game-shadow-soft"
        initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16 }}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary/15 flex items-center justify-center">
            <Heart className="w-6 h-6 text-primary" />
          </div>
          <p className="text-sm text-foreground leading-relaxed">{t('adBubbleText')}</p>
          <div className="w-full flex flex-col gap-2 mt-1">
            <motion.button onClick={onYes} whileTap={{ scale: 0.97 }}
              className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-display font-bold text-sm">
              {t('adPromptYes')}
            </motion.button>
            <motion.button onClick={onNo} whileTap={{ scale: 0.97 }}
              className="w-full py-2.5 rounded-2xl text-muted-foreground text-xs font-semibold">
              {t('adPromptNo')}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
