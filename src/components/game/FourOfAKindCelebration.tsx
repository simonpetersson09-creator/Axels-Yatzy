import { motion, AnimatePresence } from 'framer-motion';

interface FourOfAKindCelebrationProps {
  show: boolean;
}

export function FourOfAKindCelebration({ show }: FourOfAKindCelebrationProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[90] pointer-events-none flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.1 }}
        >
          {/* Heavy warm glow */}
          <motion.div
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(circle at 50% 50%, hsla(20, 75%, 50%, 0.12) 0%, transparent 45%)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          />

          {/* Impact text */}
          <motion.div
            className="relative flex items-center justify-center"
            initial={{ scale: 1.3, opacity: 0 }}
            animate={{ scale: [1.3, 0.95, 1.02, 1], opacity: [0, 1, 1, 0] }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], times: [0, 0.25, 0.6, 1] }}
          >
            <span
              className="font-display font-black text-3xl sm:text-4xl tracking-wide"
              style={{
                background: 'linear-gradient(180deg, hsl(25 80% 55%), hsl(15 70% 42%))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                filter: 'drop-shadow(0 3px 8px hsla(20, 70%, 45%, 0.4))',
              }}
            >
              Fyrtal!
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
