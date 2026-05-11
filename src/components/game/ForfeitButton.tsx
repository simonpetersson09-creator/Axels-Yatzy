import { useState, MutableRefObject } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Flag } from 'lucide-react';

interface ForfeitDialogProps {
  onConfirm: () => void;
  playerName?: string;
  pressedButtonRef?: MutableRefObject<'kasta' | 'home' | 'forfeit' | null>;
}

export function ForfeitButton({ onConfirm, playerName, pressedButtonRef }: ForfeitDialogProps) {
  const [showDialog, setShowDialog] = useState(false);

  return (
    <>
      <button
        type="button"
        onPointerDown={(e) => {
          e.stopPropagation();
          if (pressedButtonRef) pressedButtonRef.current = 'forfeit';
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          if (pressedButtonRef && pressedButtonRef.current !== 'forfeit') return;
          if (pressedButtonRef) pressedButtonRef.current = null;
          setShowDialog(true);
        }}
        onPointerCancel={() => { if (pressedButtonRef) pressedButtonRef.current = null; }}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
        className="relative inline-flex items-center justify-center gap-1.5 px-3 min-h-[44px] rounded-xl text-[11px] font-medium text-destructive/85 bg-destructive/10 border border-destructive/30 active:bg-destructive/20 transition-colors duration-200 whitespace-nowrap shadow-[0_2px_8px_-2px_hsl(0_0%_0%/0.4)]"
        style={{
          WebkitTapHighlightColor: 'transparent',
          touchAction: 'manipulation',
        }}
      >
        <Flag className="w-3 h-3 pointer-events-none" aria-hidden />
        <span className="pointer-events-none">Ge upp</span>
      </button>

      {createPortal(
        <AnimatePresence>
          {showDialog && (
            <motion.div
              className="fixed inset-0 z-[100] flex items-center justify-center px-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {/* Backdrop */}
              <motion.div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowDialog(false)}
              />

              {/* Dialog */}
              <motion.div
                className="relative glass-card p-6 w-full max-w-xs space-y-4 text-center"
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              >
                <div className="w-12 h-12 rounded-full bg-destructive/15 flex items-center justify-center mx-auto">
                  <Flag className="w-6 h-6 text-destructive" />
                </div>

                <div className="space-y-2">
                  <h2 className="font-display font-bold text-lg text-foreground">
                    Vill du ge upp matchen?
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Om du ger upp avslutas matchen direkt
                    {playerName ? ` och ${playerName} vinner` : ''}.
                  </p>
                </div>

                <div className="flex flex-col gap-2 pt-2">
                  <button
                    onClick={() => {
                      setShowDialog(false);
                      onConfirm();
                    }}
                    className="w-full py-3 rounded-xl bg-destructive text-destructive-foreground font-bold text-sm active:scale-[0.97] transition-transform touch-manipulation"
                  >
                    Ge upp match
                  </button>
                  <button
                    onClick={() => setShowDialog(false)}
                    className="w-full py-3 rounded-xl bg-secondary text-secondary-foreground font-medium text-sm active:scale-[0.97] transition-transform touch-manipulation"
                  >
                    Avbryt
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
