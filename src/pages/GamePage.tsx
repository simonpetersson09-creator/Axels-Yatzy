import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useYatzyGame } from '@/hooks/useYatzyGame';
import { DiceArea } from '@/components/game/DiceArea';
import { ScoreBoard } from '@/components/game/ScoreBoard';
import { getTotalScore } from '@/lib/yatzy-scoring';
import { motion } from 'framer-motion';

export default function GamePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { gameState, startGame, roll, toggleLock, getPossibleScores, selectCategory } = useYatzyGame();

  const playerNames: string[] = location.state?.playerNames || ['Spelare 1'];

  useEffect(() => {
    if (!gameState) {
      startGame(playerNames);
    }
  }, []);

  useEffect(() => {
    if (gameState?.gameOver) {
      const results = gameState.players.map(p => ({
        name: p.name,
        score: getTotalScore(p.scores),
        scores: p.scores,
      }));
      navigate('/results', { state: { results } });
    }
  }, [gameState?.gameOver]);

  if (!gameState) return null;

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const possibleScores = getPossibleScores();
  const canRoll = gameState.rollsLeft > 0;

  return (
    <div className="min-h-screen px-4 py-6 safe-top safe-bottom flex items-center justify-center">
      <motion.div
        className="flex gap-6 items-stretch"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        {/* Left: Score Board + controls */}
        <div className="flex flex-col gap-4">
          {/* Turn indicator */}
          <div className="text-center space-y-1">
            <p className="text-[9px] text-muted-foreground uppercase tracking-[0.25em] font-semibold">Tur</p>
            <p className="text-xl font-display font-bold text-gold-gradient leading-tight">{currentPlayer.name}</p>
            <p className="text-[11px] text-muted-foreground/60 font-medium tabular-nums tracking-wide">
              {gameState.rollsLeft === 3
                ? '\u00A0'
                : `Kast ${3 - gameState.rollsLeft} / 3`}
            </p>
          </div>

          {/* Scorecard with subtle outer glow */}
          <div className="game-shadow-soft rounded-lg overflow-hidden">
            <ScoreBoard
              players={gameState.players}
              currentPlayerIndex={gameState.currentPlayerIndex}
              possibleScores={possibleScores}
              onSelectCategory={selectCategory}
              rollsLeft={gameState.rollsLeft}
            />
          </div>

          {/* Roll button */}
          <motion.button
            onClick={roll}
            disabled={!canRoll || gameState.isRolling}
            className={`w-full py-4 rounded-2xl font-display font-bold text-[15px] tracking-wide transition-all ${
              canRoll && !gameState.isRolling
                ? 'bg-gradient-to-b from-primary to-game-gold-dark text-primary-foreground shadow-[0_6px_28px_-4px_hsl(42_88%_52%/0.35),0_2px_8px_-2px_hsl(0_0%_0%/0.35)] active:scale-[0.97]'
                : 'bg-secondary text-muted-foreground shadow-none'
            }`}
            whileTap={canRoll ? { scale: 0.97 } : {}}
          >
            {gameState.rollsLeft === 3 ? 'Kasta' : gameState.rollsLeft === 0 ? 'Välj kategori' : 'Kasta igen'}
          </motion.button>

          {gameState.rollsLeft === 0 && (
            <motion.p
              className="text-center text-[11px] text-game-gold font-medium tracking-wide"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              Välj en kategori på brickan
            </motion.p>
          )}
        </div>

        {/* Right: Dice - 25-30% width on mobile */}
        <div className="flex flex-col flex-1 min-w-0">
          <DiceArea
            dice={gameState.dice}
            lockedDice={gameState.lockedDice}
            rollsLeft={gameState.rollsLeft}
            isRolling={gameState.isRolling}
            onToggleLock={toggleLock}
          />
        </div>
      </motion.div>
    </div>
  );
}
