import { motion } from 'framer-motion';
import { Star } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

interface Props {
  onRate: () => void;
  onLater: () => void;
}

/** Small overlay card asking the player to rate the app. */
export default function RateAppPrompt({ onRate, onLater }: Props) {
  const { t } = useTranslation();

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-5 pb-8 bg-background/70 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onLater}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm rounded-3xl bg-secondary border border-game-gold/30 p-5 text-center game-shadow-soft relative overflow-hidden"
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-col items-center gap-3">
          <div className="flex items-center gap-1">
            {[0, 1, 2, 3, 4].map(i => (
              <motion.span
                key={i}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.08 * i, duration: 0.25 }}
              >
                <Star className="w-5 h-5 text-game-gold fill-game-gold" />
              </motion.span>
            ))}
          </div>
          <h2 className="text-lg font-display font-bold text-foreground">{t('rateTitle')}</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">{t('rateBody')}</p>

          <div className="w-full flex flex-col gap-2 mt-1">
            <motion.button
              onClick={onRate}
              whileTap={{ scale: 0.97 }}
              className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-display font-bold text-sm shadow-[0_4px_16px_hsl(36_78%_55%/0.3)]"
            >
              {t('rateNow')}
            </motion.button>
            <motion.button
              onClick={onLater}
              whileTap={{ scale: 0.97 }}
              className="w-full py-2.5 rounded-2xl bg-transparent text-muted-foreground text-xs font-semibold active:bg-secondary/80 transition-colors"
            >
              {t('rateLater')}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
