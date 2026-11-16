import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { playTurnHaptic } from '@/lib/haptics';
import { useTranslation } from '@/lib/i18n';

interface TurnTransitionProps {
  /** Call this when it becomes the player's turn. */
  trigger: boolean;
  /** Called after the overlay has finished its exit animation. */
  onDismiss?: () => void;
  /** Player name to show, or omit for generic "Your turn". */
  playerName?: string;
  visibleMs?: number;
}

const VISIBLE_MS = 1500;

export function TurnTransition({ trigger, onDismiss, playerName, visibleMs = VISIBLE_MS }: TurnTransitionProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  // Keep onDismiss in a ref so the timer effect does not restart on every
  // parent render (inline arrow callbacks have a new identity each render).
  const onDismissRef = useRef(onDismiss);
  useEffect(() => { onDismissRef.current = onDismiss; }, [onDismiss]);

  useEffect(() => {
    if (!trigger) return;
    setVisible(true);
    playTurnHaptic().catch(() => {});
    const t = setTimeout(() => {
      setVisible(false);
      onDismissRef.current?.();
    }, visibleMs);
    return () => clearTimeout(t);
  }, [trigger, visibleMs]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: 'easeOut', opacity: { duration: visible ? 0.15 : 0.35 } }}
        >
          {/* Subtle backdrop tint so text pops without fully blocking gameplay */}
          <div className="absolute inset-0 bg-background/30 backdrop-blur-[2px]" />

          <motion.div
            className="relative flex flex-col items-center gap-4"
            initial={{ scale: 0.8, opacity: 0, y: 14 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: -8 }}
            transition={visible
              ? { type: 'spring', stiffness: 320, damping: 24 }
              : { duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Badge with soft halo and pulsing ring */}
            <div className="relative flex items-center justify-center">
              <motion.div
                className="absolute rounded-full bg-primary/25 blur-xl"
                style={{ width: 120, height: 120 }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
              <motion.div
                className="absolute rounded-full border-2 border-primary/50"
                style={{ width: 88, height: 88 }}
                initial={{ scale: 0.9, opacity: 0.7 }}
                animate={{ scale: [0.9, 1.25], opacity: [0.7, 0] }}
                transition={{ duration: 1.1, repeat: Infinity, ease: 'easeOut' }}
              />
              <div
                className="relative w-[76px] h-[76px] rounded-[24px] flex items-center justify-center bg-gradient-to-b from-primary to-game-gold-dark"
                style={{
                  boxShadow: '0 10px 28px -6px hsl(var(--primary) / 0.5), inset 0 1px 0 hsl(0 0% 100% / 0.3)',
                }}
              >
                <span className="text-[34px] leading-none">🎲</span>
              </div>
            </div>

            <div className="flex flex-col items-center gap-1">
              <p
                className="text-[22px] font-display font-bold tracking-wide text-center text-primary"
                style={{ textShadow: '0 2px 10px hsl(var(--primary) / 0.35)' }}
              >
                {playerName ?? t('yourTurnLabel')}
              </p>
              {playerName && (
                <p className="text-[13px] font-medium text-muted-foreground text-center">
                  {t('yourTurnLabel')}
                </p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
