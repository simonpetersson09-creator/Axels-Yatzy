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
  const hasRolled = gameState.rollsLeft < 3;

  return (
    <div className="min-h-screen px-4 py-4 safe-top safe-bottom flex items-center justify-center">
      <motion.div
        className="flex gap-8 items-stretch"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        {/* Left: Score Board + Roll Button */}
        <div className="flex flex-col gap-3">
          {/* Current player indicator */}
          <div className="text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Tur</p>
            <p className="text-lg font-display font-bold text-game-gold">{currentPlayer.name}</p>
          </div>

          <ScoreBoard
            players={gameState.players}
            currentPlayerIndex={gameState.currentPlayerIndex}
            possibleScores={possibleScores}
            onSelectCategory={selectCategory}
            rollsLeft={gameState.rollsLeft}
          />

          {/* Roll button below scorecard */}
          <motion.button
            onClick={roll}
            disabled={!canRoll || gameState.isRolling}
            className={`w-full py-3 rounded-xl font-display font-bold text-base transition-all ${
              canRoll && !gameState.isRolling
                ? 'bg-primary text-primary-foreground game-shadow active:scale-95'
                : 'bg-muted text-muted-foreground'
            }`}
            whileTap={canRoll ? { scale: 0.97 } : {}}
          >
            {gameState.rollsLeft === 3 ? 'Kasta tärningarna' : gameState.rollsLeft === 0 ? 'Välj kategori' : 'Kasta igen'}
          </motion.button>

          {/* Roll counter text */}
          <p className="text-center text-sm font-semibold text-yatzy-text/80 font-display">
            {gameState.rollsLeft === 3
              ? ''
              : `Kast ${3 - gameState.rollsLeft} / 3`}
          </p>
          {gameState.rollsLeft === 0 && (
            <p className="text-center text-xs text-game-gold font-medium">
              Du måste välja en kategori
            </p>
          )}
        </div>

        {/* Right: Dice */}
        <DiceArea
          dice={gameState.dice}
          lockedDice={gameState.lockedDice}
          rollsLeft={gameState.rollsLeft}
          isRolling={gameState.isRolling}
          onToggleLock={toggleLock}
        />
      </motion.div>
    </div>
  );
}
