import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { playYatzySound } from '@/lib/yatzy-celebration-sound';

interface YatzyCelebrationProps {
  show: boolean;
  onComplete: () => void;
}

// Generate confetti particles
function useConfetti(show: boolean) {
  return useMemo(() => {
    if (!show) return [];
    const colors = [
      'hsl(36 82% 52%)',   // gold
      'hsl(42 90% 65%)',   // light gold
      'hsl(0 75% 55%)',    // red
      'hsl(210 70% 55%)',  // blue
      'hsl(155 60% 45%)',  // green
      'hsl(280 60% 55%)',  // purple
      'hsl(45 95% 65%)',   // yellow
    ];
    return Array.from({ length: 40 }, (_, i) => ({
      id: i,
      x: (Math.random() - 0.5) * 600,
      y: -(200 + Math.random() * 300),
      rotate: Math.random() * 720 - 360,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 4 + Math.random() * 6,
      delay: Math.random() * 0.3,
      isRect: Math.random() > 0.5,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);
}

export function YatzyCelebration({ show, onComplete }: YatzyCelebrationProps) {
  const [visible, setVisible] = useState(false);
  const confetti = useConfetti(show);

  useEffect(() => {
    if (show) {
      setVisible(true);
      playYatzySound();
      const timer = setTimeout(() => {
        setVisible(false);
        onComplete();
      }, 2200);
      return () => clearTimeout(timer);
    }
  }, [show, onComplete]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Backdrop glow */}
          <motion.div
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(circle at 50% 45%, rgba(245,185,66,0.15) 0%, transparent 60%)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Confetti particles */}
          {confetti.map((p) => (
            <motion.div
              key={p.id}
              className="absolute"
              style={{
                width: p.isRect ? p.size * 0.6 : p.size,
                height: p.isRect ? p.size * 1.4 : p.size,
                borderRadius: p.isRect ? 1 : '50%',
                background: p.color,
                left: '50%',
                top: '45%',
              }}
              initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0 }}
              animate={{
                x: p.x,
                y: [0, p.y * 0.3, p.y * -1.5],
                opacity: [1, 1, 0],
                rotate: p.rotate,
                scale: [0, 1.2, 0.8],
              }}
              transition={{
                duration: 1.8,
                delay: p.delay,
                ease: 'easeOut',
                y: { duration: 1.8, ease: [0.2, 0, 0.8, 1] },
              }}
            />
          ))}

          {/* Main text */}
          <motion.div
            className="relative flex flex-col items-center gap-2"
            initial={{ scale: 0, rotate: -10 }}
            animate={{ scale: [0, 1.3, 1], rotate: [−10, 3, 0] }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
          >
            <span
              className="font-display font-black text-6xl sm:text-7xl tracking-wider"
              style={{
                background: 'linear-gradient(135deg, hsl(42 90% 65%), hsl(36 82% 52%), hsl(28 80% 45%))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                filter: 'drop-shadow(0 4px 20px rgba(245,185,66,0.5))',
              }}
            >
              YATZY!
            </span>
            <motion.span
              className="font-display font-bold text-2xl"
              style={{ color: 'hsl(42 90% 65%)', textShadow: '0 2px 10px rgba(245,185,66,0.4)' }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              +50
            </motion.span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
