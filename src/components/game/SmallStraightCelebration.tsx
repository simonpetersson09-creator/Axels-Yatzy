import { motion, AnimatePresence } from 'framer-motion';

interface SmallStraightCelebrationProps {
  show: boolean;
}

export function SmallStraightCelebration({ show }: SmallStraightCelebrationProps) {
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
          {/* Soft cool glow */}
          <motion.div
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(circle at 50% 50%, hsla(185, 60%, 50%, 0.08) 0%, transparent 45%)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />

          {/* Text */}
          <motion.div
            className="relative flex items-center justify-center"
            initial={{ scale: 0.7, opacity: 0, y: 4 }}
            animate={{ scale: [0.7, 1.06, 1], opacity: [0, 1, 1, 0], y: [4, 0, 0] }}
            transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1], times: [0, 0.35, 0.7, 1] }}
          >
            <span
              className="font-display font-bold text-2xl sm:text-3xl tracking-wide"
              style={{
                background: 'linear-gradient(135deg, hsl(185 55% 55%), hsl(160 50% 45%))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                filter: 'drop-shadow(0 1px 6px hsla(175, 50%, 50%, 0.3))',
              }}
            >
              Liten stege
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
