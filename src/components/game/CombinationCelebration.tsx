import { motion, AnimatePresence } from 'framer-motion';

export type CombinationType = 'threeOfAKind' | 'fourOfAKind' | 'smallStraight' | 'largeStraight' | 'fullHouse';

interface CombinationConfig {
  label: string;
  duration: number;
  fontSize: string;
  fontWeight: string;
  gradient: string;
  shadow: string;
  glow: string | null;
  glowDuration: number;
  scaleFrom: number;
  scaleKeyframes: number[];
  opacityKeyframes: number[];
  times: number[];
  easing: number[];
  yShift?: number;
}

const CONFIGS: Record<CombinationType, CombinationConfig> = {
  // Level 1 — Subtil, lågintensiv
  threeOfAKind: {
    label: 'Triss',
    duration: 0.22,
    fontSize: 'text-xl sm:text-2xl',
    fontWeight: 'font-bold',
    gradient: '',
    shadow: 'drop-shadow(0 1px 3px hsla(220, 15%, 50%, 0.15))',
    glow: null,
    glowDuration: 0,
    scaleFrom: 0.88,
    scaleKeyframes: [0.88, 1.02, 1],
    opacityKeyframes: [0, 0.8, 0],
    times: [0, 0.4, 1],
    easing: [0.25, 1, 0.5, 1],
  },
  // Level 2 — Flow, mjuk sekvens
  smallStraight: {
    label: 'Liten stege',
    duration: 0.3,
    fontSize: 'text-2xl sm:text-3xl',
    fontWeight: 'font-bold',
    gradient: 'linear-gradient(135deg, hsl(185 55% 55%), hsl(160 50% 45%))',
    shadow: 'drop-shadow(0 1px 5px hsla(175, 50%, 50%, 0.25))',
    glow: 'radial-gradient(circle at 50% 50%, hsla(185, 60%, 50%, 0.07) 0%, transparent 45%)',
    glowDuration: 0.3,
    scaleFrom: 0.75,
    scaleKeyframes: [0.75, 1.05, 1],
    opacityKeyframes: [0, 1, 1, 0],
    times: [0, 0.35, 0.65, 1],
    easing: [0.25, 1, 0.5, 1],
    yShift: 3,
  },
  // Level 3 — Tydlig, impact
  fourOfAKind: {
    label: 'Fyrtal!',
    duration: 0.32,
    fontSize: 'text-3xl sm:text-4xl',
    fontWeight: 'font-black',
    gradient: 'linear-gradient(180deg, hsl(25 80% 55%), hsl(15 70% 42%))',
    shadow: 'drop-shadow(0 2px 8px hsla(20, 70%, 45%, 0.35))',
    glow: 'radial-gradient(circle at 50% 50%, hsla(20, 75%, 50%, 0.1) 0%, transparent 45%)',
    glowDuration: 0.32,
    scaleFrom: 1.25,
    scaleKeyframes: [1.25, 0.96, 1.02, 1],
    opacityKeyframes: [0, 1, 1, 0],
    times: [0, 0.25, 0.6, 1],
    easing: [0.22, 1, 0.36, 1],
  },
  // Level 4 — Wow, starkare flow
  largeStraight: {
    label: 'Stor stege!',
    duration: 0.38,
    fontSize: 'text-3xl sm:text-4xl',
    fontWeight: 'font-black',
    gradient: 'linear-gradient(135deg, hsl(175 65% 58%), hsl(210 70% 55%), hsl(185 60% 48%))',
    shadow: 'drop-shadow(0 2px 10px hsla(195, 60%, 50%, 0.4))',
    glow: 'radial-gradient(circle at 50% 50%, hsla(175, 70%, 50%, 0.12) 0%, hsla(210, 60%, 55%, 0.04) 30%, transparent 50%)',
    glowDuration: 0.38,
    scaleFrom: 0.5,
    scaleKeyframes: [0.5, 1.14, 0.97, 1.03, 1],
    opacityKeyframes: [0, 1, 1, 1, 0],
    times: [0, 0.22, 0.48, 0.75, 1],
    easing: [0.34, 1.56, 0.64, 1],
  },
  // Level 5 — Stark reward
  fullHouse: {
    label: 'Kåk!',
    duration: 0.4,
    fontSize: 'text-3xl sm:text-4xl',
    fontWeight: 'font-black',
    gradient: 'linear-gradient(135deg, hsl(42 90% 62%), hsl(36 82% 48%))',
    shadow: 'drop-shadow(0 2px 10px hsla(36, 80%, 50%, 0.4))',
    glow: 'radial-gradient(circle at 50% 50%, hsla(36, 80%, 55%, 0.12) 0%, transparent 45%)',
    glowDuration: 0.4,
    scaleFrom: 0.55,
    scaleKeyframes: [0.55, 1.14, 0.98, 1],
    opacityKeyframes: [0, 1, 1, 0],
    times: [0, 0.28, 0.65, 1],
    easing: [0.34, 1.56, 0.64, 1],
  },
};

interface CombinationCelebrationProps {
  type: CombinationType | null;
}

export function CombinationCelebration({ type }: CombinationCelebrationProps) {
  const config = type ? CONFIGS[type] : null;

  return (
    <AnimatePresence mode="wait">
      {config && type && (
        <motion.div
          key={type}
          className="fixed inset-0 z-[90] pointer-events-none flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.08 }}
        >
          {/* Background glow */}
          {config.glow && (
            <motion.div
              className="absolute inset-0"
              style={{ background: config.glow }}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0] }}
              transition={{ duration: config.glowDuration, ease: 'easeOut' }}
            />
          )}

          {/* Text */}
          <motion.div
            className="relative flex items-center justify-center"
            initial={{
              scale: config.scaleFrom,
              opacity: 0,
              ...(config.yShift ? { y: config.yShift } : {}),
            }}
            animate={{
              scale: config.scaleKeyframes,
              opacity: config.opacityKeyframes,
              ...(config.yShift ? { y: [config.yShift, 0, 0] } : {}),
            }}
            transition={{
              duration: config.duration,
              ease: config.easing as [number, number, number, number],
              times: config.times,
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
                  : { color: 'hsl(220 15% 55%)' }),
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
