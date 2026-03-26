import { motion, AnimatePresence } from 'framer-motion';

interface FullHouseCelebrationProps {
  show: boolean;
}

export function FullHouseCelebration({ show }: FullHouseCelebrationProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[90] pointer-events-none flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* Subtle warm glow */}
          <motion.div
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(circle at 50% 50%, hsla(36, 80%, 55%, 0.1) 0%, transparent 50%)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />

          {/* Text badge */}
          <motion.div
            className="relative flex items-center justify-center"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: [0.6, 1.12, 1], opacity: [0, 1, 1, 0] }}
            transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1], times: [0, 0.3, 0.7, 1] }}
          >
            <span
              className="font-display font-black text-3xl sm:text-4xl tracking-wide"
              style={{
                background: 'linear-gradient(135deg, hsl(42 88% 62%), hsl(36 82% 48%))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                filter: 'drop-shadow(0 2px 8px hsla(36, 80%, 50%, 0.35))',
              }}
            >
              Kåk!
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
