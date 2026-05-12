import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation, type TranslationKey } from '@/lib/i18n';

export type CombinationType = 'threeOfAKind' | 'fourOfAKind' | 'smallStraight' | 'largeStraight' | 'fullHouse';

interface CombinationConfig {
  labelKey: TranslationKey;
  fontSize: string;
  fontWeight: string;
  gradient: string;
  shadow: string;
  glow: string | null;
  bounce: boolean;
  color?: string;
}

const CONFIGS: Record<CombinationType, CombinationConfig> = {
  threeOfAKind: {
    labelKey: 'celeb_threeOfAKind',
    fontSize: 'text-xl sm:text-2xl',
    fontWeight: 'font-bold',
    gradient: '',
    shadow: 'drop-shadow(0 1px 4px hsla(220, 15%, 50%, 0.2))',
    glow: null,
    bounce: false,
    color: 'hsl(220 15% 60%)',
  },
  smallStraight: {
    labelKey: 'celeb_smallStraight',
    fontSize: 'text-2xl sm:text-3xl',
    fontWeight: 'font-bold',
    gradient: 'linear-gradient(135deg, hsl(185 55% 58%), hsl(160 50% 48%))',
    shadow: 'drop-shadow(0 2px 8px hsla(175, 50%, 50%, 0.3))',
    glow: 'radial-gradient(circle at 50% 50%, hsla(185, 60%, 50%, 0.1) 0%, transparent 50%)',
    bounce: false,
  },
  fourOfAKind: {
    labelKey: 'celeb_fourOfAKind',
    fontSize: 'text-3xl sm:text-4xl',
    fontWeight: 'font-black',
    gradient: 'linear-gradient(180deg, hsl(25 80% 58%), hsl(15 70% 45%))',
    shadow: 'drop-shadow(0 3px 12px hsla(20, 70%, 45%, 0.4))',
    glow: 'radial-gradient(circle at 50% 50%, hsla(20, 75%, 50%, 0.13) 0%, transparent 50%)',
    bounce: true,
  },
  largeStraight: {
    labelKey: 'celeb_largeStraight',
    fontSize: 'text-3xl sm:text-4xl',
    fontWeight: 'font-black',
    gradient: 'linear-gradient(135deg, hsl(175 65% 60%), hsl(210 70% 58%), hsl(185 60% 50%))',
    shadow: 'drop-shadow(0 3px 14px hsla(195, 60%, 50%, 0.45))',
    glow: 'radial-gradient(circle at 50% 50%, hsla(175, 70%, 50%, 0.15) 0%, hsla(210, 60%, 55%, 0.05) 35%, transparent 55%)',
    bounce: true,
  },
  fullHouse: {
    labelKey: 'celeb_fullHouse',
    fontSize: 'text-3xl sm:text-4xl',
    fontWeight: 'font-black',
    gradient: 'linear-gradient(135deg, hsl(42 90% 65%), hsl(36 82% 50%))',
    shadow: 'drop-shadow(0 3px 14px hsla(36, 80%, 50%, 0.45))',
    glow: 'radial-gradient(circle at 50% 50%, hsla(36, 80%, 55%, 0.15) 0%, transparent 50%)',
    bounce: true,
  },
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
          {/* Background glow — soft fade in/out */}
          {config.glow && (
            <motion.div
              className="absolute inset-0"
              style={{ background: config.glow }}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 1, 0] }}
              transition={{
                duration: TOTAL,
                ease: 'easeInOut',
                times: [0, INTRO / TOTAL, (INTRO + HOLD) / TOTAL, 1],
              }}
            />
          )}

          {/* Text — smooth fade/scale-in, hold, soft fade-out */}
          <motion.div
            className="relative flex items-center justify-center"
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
            <span
              className={`font-display ${config.fontWeight} ${config.fontSize} tracking-wide`}
              style={{
                ...(config.gradient
                  ? {
                      background: config.gradient,
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                    }
                  : { color: config.color ?? 'hsl(220 15% 60%)' }),
                filter: config.shadow,
              }}
            >
              {config.label}
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
