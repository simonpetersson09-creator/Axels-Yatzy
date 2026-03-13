import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMultiplayerGame } from '@/hooks/useMultiplayerGame';
import { DiceArea } from '@/components/game/DiceArea';
import { ScoreBoard } from '@/components/game/ScoreBoard';
import { getTotalScore } from '@/lib/yatzy-scoring';
import { motion } from 'framer-motion';

export default function MultiplayerGamePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    gameState, gameCode, status, myPlayerIndex, isMyTurn,
    roll, toggleLock, getPossibleScores, selectCategory, rejoinGame,
  } = useMultiplayerGame();

  const gameId = searchParams.get('gameId');

  useEffect(() => {
    if (gameId && !gameState) {
      rejoinGame(gameId);
    }
  }, [gameId]);

  useEffect(() => {
    if (status === 'finished' && gameState) {
      const results = gameState.players.map(p => ({
        name: p.name,
        score: getTotalScore(p.scores),
        scores: p.scores,
      }));
      navigate('/results', { state: { results } });
    }
  }, [status]);

  if (!gameState) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">Laddar spel...</p>
        </div>
      </div>
    );
  }

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const possibleScores = isMyTurn ? getPossibleScores() : null;
  const canRoll = gameState.rollsLeft > 0 && isMyTurn;

  return (
    <div className="min-h-screen px-4 py-6 safe-top safe-bottom flex items-center justify-center">
      <motion.div
        className="flex flex-col gap-4"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        {/* Turn indicator */}
        <div className="text-center space-y-1">
          {gameCode && (
            <p className="text-[9px] text-muted-foreground/50 font-mono tracking-wider mb-1">
              Kod: {gameCode}
            </p>
          )}
          <p className="text-[9px] text-muted-foreground uppercase tracking-[0.25em] font-semibold">
            {isMyTurn ? 'Din tur' : 'Tur'}
          </p>
          <p className="text-xl font-display font-bold text-gold-gradient leading-tight">
            {currentPlayer.name}
            {!isMyTurn && <span className="text-muted-foreground text-sm font-normal ml-2">spelar...</span>}
          </p>
          <p className="text-[11px] text-muted-foreground/60 font-medium tabular-nums tracking-wide">
            {gameState.rollsLeft === 3
              ? '\u00A0'
              : `Kast ${3 - gameState.rollsLeft} / 3`}
          </p>
        </div>

        {/* Scoreboard + Dice */}
        <div className="flex gap-6 items-stretch">
          <div className="game-shadow-soft rounded-lg overflow-hidden">
            <ScoreBoard
              players={gameState.players}
              currentPlayerIndex={gameState.currentPlayerIndex}
              possibleScores={possibleScores}
              onSelectCategory={selectCategory}
              rollsLeft={gameState.rollsLeft}
            />
          </div>

          <DiceArea
            dice={gameState.dice}
            lockedDice={gameState.lockedDice}
            rollsLeft={gameState.rollsLeft}
            isRolling={gameState.isRolling}
            onToggleLock={toggleLock}
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
          {!isMyTurn
            ? `Väntar på ${currentPlayer.name}...`
            : gameState.rollsLeft === 3
              ? 'Kasta'
              : gameState.rollsLeft === 0
                ? 'Välj kategori'
                : 'Kasta igen'}
        </motion.button>

        {isMyTurn && gameState.rollsLeft === 0 && (
          <motion.p
            className="text-center text-[11px] text-primary font-medium tracking-wide"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            Välj en kategori på brickan
          </motion.p>
        )}
      </motion.div>
    </div>
  );
}
