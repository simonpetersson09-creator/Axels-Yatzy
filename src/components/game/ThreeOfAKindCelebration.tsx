import { motion, AnimatePresence } from 'framer-motion';

interface ThreeOfAKindCelebrationProps {
  show: boolean;
}

export function ThreeOfAKindCelebration({ show }: ThreeOfAKindCelebrationProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[90] pointer-events-none flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.08 }}
        >
          <motion.div
            className="relative flex items-center justify-center"
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: [0.85, 1.02, 1], opacity: [0, 0.85, 0] }}
            transition={{ duration: 0.25, ease: 'easeOut', times: [0, 0.4, 1] }}
          >
            <span
              className="font-display font-bold text-xl sm:text-2xl tracking-wide"
              style={{
                color: 'hsl(220 15% 55%)',
                filter: 'drop-shadow(0 1px 4px hsla(220, 15%, 50%, 0.2))',
              }}
            >
              Triss
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
