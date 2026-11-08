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
          {/* Round gold medal in the roll button's design — smooth fade/scale-in, hold, soft fade-out */}
          <motion.div
            className="relative"
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
            {/* Soft halo behind the medal */}
            <div
              aria-hidden="true"
              className="absolute -inset-6 rounded-full"
              style={{
                background:
                  'radial-gradient(circle, hsl(42 88% 55% / 0.35) 0%, hsl(42 88% 55% / 0.12) 45%, transparent 70%)',
              }}
            />
            <div
              className="relative flex h-32 w-32 sm:h-36 sm:w-36 flex-col items-center justify-center gap-1 overflow-hidden rounded-full border border-game-gold-light/60 backdrop-blur-sm"
              style={{
                background:
                  'radial-gradient(circle at 32% 26%, hsl(45 92% 74% / 0.95) 0%, hsl(42 88% 60% / 0.55) 32%, transparent 58%), linear-gradient(to bottom, hsl(var(--primary) / 0.88), hsl(var(--game-gold-dark) / 0.88))',
                boxShadow:
                  '0 10px 36px -4px hsl(42 88% 52% / 0.5), 0 4px 16px -2px hsl(0 0% 0% / 0.45), inset 0 0 0 4px hsl(36 78% 55% / 0.35), inset 0 2px 6px hsl(45 95% 80% / 0.5), inset 0 -8px 14px hsl(28 75% 32% / 0.35)',
              }}
            >
              {/* Sheen sweep across the medal on intro */}
              <motion.div
                aria-hidden="true"
                className="absolute inset-y-0 w-1/2"
                style={{
                  background:
                    'linear-gradient(105deg, transparent 0%, hsl(48 100% 88% / 0.55) 50%, transparent 100%)',
                }}
                initial={{ left: '-60%' }}
                animate={{ left: ['-60%', '110%', '110%'] }}
                transition={{ duration: TOTAL, times: [0, INTRO / TOTAL, 1], ease: 'easeInOut' }}
              />
              <span
                aria-hidden="true"
                className="text-primary-foreground/80 text-[11px] leading-none tracking-[0.3em]"
              >
                ★ ★ ★
              </span>
              <span
                className="font-display font-black text-primary-foreground text-xl sm:text-2xl tracking-wide whitespace-nowrap leading-none"
                style={{ textShadow: '0 1px 0 hsl(45 95% 75% / 0.35), 0 -1px 2px hsl(28 75% 30% / 0.35)' }}
              >
                {t(config.labelKey)}
              </span>
              <span aria-hidden="true" className="text-primary-foreground/80 text-[10px] leading-none">
                ★
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
