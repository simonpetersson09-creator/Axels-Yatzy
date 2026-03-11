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
          {/* Turn indicator + roll status */}
          <div className="text-center space-y-0.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Tur</p>
            <p className="text-lg font-display font-bold text-game-gold leading-tight">{currentPlayer.name}</p>
            <p className="text-[11px] text-muted-foreground/70 font-medium tabular-nums">
              {gameState.rollsLeft === 3
                ? '\u00A0'
                : `Kast ${3 - gameState.rollsLeft} / 3`}
            </p>
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
