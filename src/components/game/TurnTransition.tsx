import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { playTurnHaptic } from '@/lib/haptics';

interface TurnTransitionProps {
  /** Call this when it becomes the player's turn. */
  trigger: boolean;
  /** Called after the overlay has finished its exit animation. */
  onDismiss?: () => void;
  /** Player name to show, or omit for generic "Your turn". */
  playerName?: string;
}

const VISIBLE_MS = 1200;

export function TurnTransition({ trigger, onDismiss, playerName }: TurnTransitionProps) {
  const [visible, setVisible] = useState(false);
  const [hapticFired, setHapticFired] = useState(false);

  const dismiss = useCallback(() => {
    setVisible(false);
    setHapticFired(false);
    onDismiss?.();
  }, [onDismiss]);

  useEffect(() => {
    if (!trigger) return;
    // Show overlay
    setVisible(true);
    // Fire haptic once per trigger
    if (!hapticFired) {
      setHapticFired(true);
      playTurnHaptic().catch(() => {});
    }
    const t = setTimeout(dismiss, VISIBLE_MS);
    return () => clearTimeout(t);
  }, [trigger, hapticFired, dismiss]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          {/* Subtle backdrop tint so text pops without fully blocking gameplay */}
          <div className="absolute inset-0 bg-background/30 backdrop-blur-[2px]" />

          <motion.div
            className="relative flex flex-col items-center gap-3"
            initial={{ scale: 0.85, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: -6 }}
            transition={{
              duration: 0.35,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <div
              className="w-[72px] h-[72px] rounded-[22px] flex items-center justify-center"
              style={{
                background: 'linear-gradient(180deg, hsl(42 90% 60%), hsl(36 82% 48%))',
                boxShadow: '0 8px 24px -4px hsl(42 80% 50% / 0.45), inset 0 1px 0 rgba(255,255,255,0.25)',
              }}
            >
              <span className="text-[32px] leading-none">🎲</span>
            </div>
            <p
              className="text-[20px] font-display font-bold tracking-wide text-center"
              style={{
                color: 'hsl(42 90% 65%)',
                textShadow: '0 2px 8px hsl(42 80% 40% / 0.35)',
              }}
            >
              {playerName ? `${playerName}` : 'Din tur'}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
