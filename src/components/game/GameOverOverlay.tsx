import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, RotateCcw, Home } from 'lucide-react';

interface PlayerResult {
  name: string;
  score: number;
  isAi?: boolean;
}

interface GameOverOverlayProps {
  show: boolean;
  players: PlayerResult[];
  aiPlayers: number[];
  onPlayAgain: () => void;
  onBackToMenu: () => void;
}

export function GameOverOverlay({ show, players, aiPlayers, onPlayAgain, onBackToMenu }: GameOverOverlayProps) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const winner = sorted[0];
  const isHumanPlayer = players.length > 0 && !aiPlayers.includes(0);
  const humanWon = isHumanPlayer && winner?.name === players[0]?.name;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          />

          {/* Panel */}
          <motion.div
            className="relative w-full max-w-sm rounded-2xl bg-card border border-border p-6 space-y-6 shadow-[0_16px_64px_-12px_hsl(0_0%_0%/0.6)]"
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.95 }}
            transition={{ duration: 0.4, ease: 'easeOut', delay: 0.1 }}
          >
            {/* Trophy + Winner */}
            <div className="flex flex-col items-center gap-3">
              <motion.div
                className="w-16 h-16 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
              >
                <Trophy className="w-8 h-8 text-primary" />
              </motion.div>

              <motion.h2
                className="text-2xl font-display font-black text-foreground"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                {humanWon ? 'Du vinner!' : `${winner?.name} vinner!`}
              </motion.h2>
            </div>

            {/* Final Scores */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider text-center mb-3">
                Slutresultat
              </p>
              {sorted.map((player, i) => {
                const isWinner = i === 0;
                return (
                  <motion.div
                    key={player.name}
                    className={`flex items-center justify-between px-4 py-2.5 rounded-xl transition-all ${
                      isWinner
                        ? 'bg-primary/10 ring-1 ring-primary/25'
                        : 'bg-secondary/50'
                    }`}
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.45 + i * 0.08 }}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                        isWinner
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {i + 1}
                      </span>
                      <span className={`text-sm font-semibold ${
                        isWinner ? 'text-foreground' : 'text-muted-foreground'
                      }`}>
                        {player.name}
                      </span>
                    </div>
                    <span className={`font-display font-bold text-lg tabular-nums ${
                      isWinner ? 'text-primary' : 'text-foreground'
                    }`}>
                      {player.score}
                    </span>
                  </motion.div>
                );
              })}
            </div>

            {/* Buttons */}
            <div className="flex flex-col gap-2.5 pt-2">
              <motion.button
                onClick={onPlayAgain}
                className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-display font-bold text-[15px] flex items-center justify-center gap-2 shadow-[0_4px_20px_-4px_hsl(var(--primary)/0.4)]"
                whileTap={{ scale: 0.97 }}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
              >
                <RotateCcw className="w-4 h-4" />
                Spela igen
              </motion.button>
              <motion.button
                onClick={onBackToMenu}
                className="w-full py-3 rounded-2xl bg-secondary text-secondary-foreground font-semibold text-sm flex items-center justify-center gap-2"
                whileTap={{ scale: 0.97 }}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.65 }}
              >
                <Home className="w-4 h-4" />
                Till menyn
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
