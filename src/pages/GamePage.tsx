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

  return (
    <div className="min-h-screen px-4 py-4 safe-top safe-bottom">
      <motion.div
        className="max-w-sm mx-auto space-y-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        {/* Dice Area */}
        <DiceArea
          dice={gameState.dice}
          lockedDice={gameState.lockedDice}
          rollsLeft={gameState.rollsLeft}
          isRolling={gameState.isRolling}
          onRoll={roll}
          onToggleLock={toggleLock}
          currentPlayerName={currentPlayer.name}
        />

        {/* Score Board */}
        <ScoreBoard
          players={gameState.players}
          currentPlayerIndex={gameState.currentPlayerIndex}
          possibleScores={possibleScores}
          onSelectCategory={selectCategory}
          rollsLeft={gameState.rollsLeft}
        />
      </motion.div>
    </div>
  );
}
