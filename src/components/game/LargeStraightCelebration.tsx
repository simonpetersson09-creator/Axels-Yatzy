import { motion, AnimatePresence } from 'framer-motion';

interface LargeStraightCelebrationProps {
  show: boolean;
}

export function LargeStraightCelebration({ show }: LargeStraightCelebrationProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[90] pointer-events-none flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
        >
          {/* Stronger warm-cool glow */}
          <motion.div
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(circle at 50% 50%, hsla(175, 70%, 50%, 0.13) 0%, hsla(210, 60%, 55%, 0.05) 30%, transparent 50%)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />

          {/* Text with extra punch */}
          <motion.div
            className="relative flex items-center justify-center"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: [0.5, 1.15, 0.97, 1.04, 1], opacity: [0, 1, 1, 1, 0] }}
            transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1], times: [0, 0.25, 0.5, 0.75, 1] }}
          >
            <span
              className="font-display font-black text-3xl sm:text-4xl tracking-wide"
              style={{
                background: 'linear-gradient(135deg, hsl(175 65% 58%), hsl(210 70% 55%), hsl(185 60% 48%))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                filter: 'drop-shadow(0 2px 10px hsla(195, 60%, 50%, 0.4))',
              }}
            >
              Stor stege!
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
