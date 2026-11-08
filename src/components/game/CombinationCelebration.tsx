import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation, type TranslationKey } from '@/lib/i18n';

export type CombinationType = 'threeOfAKind' | 'fourOfAKind' | 'smallStraight' | 'largeStraight' | 'fullHouse';

interface CombinationConfig {
  labelKey: TranslationKey;
  bounce: boolean;
}

const CONFIGS: Record<CombinationType, CombinationConfig> = {
  threeOfAKind: { labelKey: 'celeb_threeOfAKind', bounce: false },
  smallStraight: { labelKey: 'celeb_smallStraight', bounce: false },
  fourOfAKind: { labelKey: 'celeb_fourOfAKind', bounce: true },
  largeStraight: { labelKey: 'celeb_largeStraight', bounce: true },
  fullHouse: { labelKey: 'celeb_fullHouse', bounce: true },
};

// Unified timing (premium feel):
// intro ~600ms, hold ~2800ms, outro ~1000ms => total ~4400ms
const INTRO = 0.6;
const HOLD = 2.8;
const OUTRO = 1.0;
const TOTAL = INTRO + HOLD + OUTRO;

interface CombinationCelebrationProps {
  type: CombinationType | null;
}

export function CombinationCelebration({ type }: CombinationCelebrationProps) {
  const { t } = useTranslation();
  const config = type ? CONFIGS[type] : null;

  return (
    <AnimatePresence mode="wait">
      {config && type && (
        <motion.div
          key={type}
          className="absolute inset-0 z-[90] pointer-events-none flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          {/* Gold pill in the roll button's design — smooth fade/scale-in, hold, soft fade-out */}
          <motion.div
            className="relative flex items-center gap-2 rounded-full bg-gradient-to-b from-primary to-game-gold-dark px-4 py-1.5 shadow-[0_8px_32px_-4px_hsl(42_88%_52%/0.45),0_4px_16px_-2px_hsl(0_0%_0%/0.45)]"
            initial={{ scale: 0.85, opacity: 0, y: 4 }}
            animate={{
              scale: config.bounce ? [0.85, 1.06, 1, 1, 1] : [0.92, 1.02, 1, 1, 1],
              opacity: [0, 1, 1, 1, 0],
              y: [4, 0, 0, 0, -2],
            }}
            transition={{
              duration: TOTAL,
              ease: [0.22, 1, 0.36, 1],
              times: [
                0,
                INTRO / TOTAL,
                (INTRO + 0.1) / TOTAL,
                (INTRO + HOLD) / TOTAL,
                1,
              ],
            }}
          >
            <span aria-hidden="true" className="text-primary-foreground/85 text-[10px] leading-none">
              ★
            </span>
            <span className="font-display font-bold text-primary-foreground text-sm sm:text-base tracking-wide whitespace-nowrap leading-none">
              {t(config.labelKey)}
            </span>
            <span aria-hidden="true" className="text-primary-foreground/85 text-[10px] leading-none">
              ★
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
