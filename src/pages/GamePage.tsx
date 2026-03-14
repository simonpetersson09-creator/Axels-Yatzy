import { useEffect, useCallback, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useYatzyGame } from '@/hooks/useYatzyGame';
import { DiceArea } from '@/components/game/DiceArea';
import { ScoreBoard } from '@/components/game/ScoreBoard';
import { YatzyCelebration } from '@/components/game/YatzyCelebration';
import { getTotalScore } from '@/lib/yatzy-scoring';
import { setActiveGame, clearActiveGame } from '@/lib/active-game';
import { playRollSound } from '@/lib/dice-sounds';
import { motion } from 'framer-motion';
import { Home } from 'lucide-react';

export default function GamePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { gameState, startGame, roll, toggleLock, getPossibleScores, selectCategory } = useYatzyGame();

  const playerNames: string[] = location.state?.playerNames || ['Spelare 1'];
  const autoRollRef = useRef<string | null>(null);

  useEffect(() => {
    if (!gameState) {
      startGame(playerNames);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (gameState && !gameState.gameOver) {
      setActiveGame({ type: 'local', timestamp: Date.now() });
    }
  }, [gameState]);

  useEffect(() => {
    if (gameState?.gameOver) {
      clearActiveGame();
      const results = gameState.players.map(p => ({
        name: p.name,
        score: getTotalScore(p.scores),
        scores: p.scores,
      }));
      navigate('/results', { state: { results } });
    }
  }, [gameState?.gameOver]);

  // Auto-roll first throw when turn changes
  useEffect(() => {
    if (!gameState || gameState.gameOver || gameState.isRolling) return;
    if (gameState.rollsLeft !== 3) return;
    const key = `${gameState.currentPlayerIndex}-${gameState.round}`;
    if (autoRollRef.current === key) return;
    autoRollRef.current = key;
    const t = setTimeout(() => {
      playRollSound();
      roll();
    }, 350);
    return () => clearTimeout(t);
  }, [gameState?.currentPlayerIndex, gameState?.round, gameState?.rollsLeft, gameState?.gameOver, gameState?.isRolling, roll]);

  const [showYatzyCelebration, setShowYatzyCelebration] = useState(false);

  const handleRoll = useCallback(() => {
    playRollSound();
    roll();
  }, [roll]);

  const handleSelectCategory = useCallback((categoryId: string) => {
    // Check if selecting yatzy with a score of 50
    if (categoryId === 'yatzy' && gameState) {
      const dice = gameState.dice;
      const allSame = dice.every(d => d === dice[0]);
      if (allSame) {
        setShowYatzyCelebration(true);
      }
    }
    selectCategory(categoryId as any);
  }, [gameState, selectCategory]);

  if (!gameState) return null;

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const possibleScores = gameState.isRolling ? null : getPossibleScores();
  const canRoll = gameState.rollsLeft > 0;

  const PLAYER_COLORS = [
    { ring: 'ring-yatzy-player1', bg: 'bg-yatzy-player1', glow: 'shadow-[0_0_8px_hsl(36_82%_52%/0.5)]' },
    { ring: 'ring-yatzy-player2', bg: 'bg-yatzy-player2', glow: 'shadow-[0_0_8px_hsl(210_70%_52%/0.5)]' },
    { ring: 'ring-yatzy-player3', bg: 'bg-yatzy-player3', glow: 'shadow-[0_0_8px_hsl(155_60%_42%/0.5)]' },
    { ring: 'ring-yatzy-player4', bg: 'bg-yatzy-player4', glow: 'shadow-[0_0_8px_hsl(350_65%_52%/0.5)]' },
  ];

  return (
    <div className="min-h-screen px-3 sm:px-4 py-4 sm:py-6 safe-top safe-bottom flex items-center justify-center">
      <YatzyCelebration
        show={showYatzyCelebration}
        onComplete={() => setShowYatzyCelebration(false)}
      />
      <motion.div
        className="flex flex-col gap-4"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        {/* Scoreboard + Players + Dice */}
        <div className="flex gap-3 sm:gap-6 items-start">
          {/* Left: Scoreboard stretched full height */}
          <div className="flex flex-col gap-3">
            <div className="game-shadow-soft rounded-lg overflow-hidden">
              <ScoreBoard
                players={gameState.players}
                currentPlayerIndex={gameState.currentPlayerIndex}
                possibleScores={possibleScores}
                onSelectCategory={handleSelectCategory}
                rollsLeft={gameState.rollsLeft}
              />
            </div>

            {/* Roll count */}
            <p className="text-center text-[11px] text-muted-foreground/60 font-medium tabular-nums tracking-wide">
              {gameState.rollsLeft === 3
                ? '\u00A0'
                : gameState.rollsLeft === 0
                  ? 'Välj en kategori på brickan'
                  : `Kast ${3 - gameState.rollsLeft} / 3`}
            </p>
          </div>

          <div className="flex flex-col gap-4">
            {/* Player indicators */}
            <div className="flex flex-col gap-2">
              {gameState.players.map((player, idx) => {
                const isCurrent = idx === gameState.currentPlayerIndex;
                const color = PLAYER_COLORS[idx];
                return (
                  <motion.div
                    key={player.id}
                    className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl transition-all ${
                      isCurrent ? 'bg-secondary/80' : ''
                    }`}
                    animate={isCurrent ? { scale: 1.05 } : { scale: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  >
                    <div className={`w-5 h-5 rounded-full ${color.bg} ring-2 ring-offset-2 ring-offset-background ${
                      isCurrent ? `${color.ring} ${color.glow}` : 'ring-transparent'
                    } transition-all`} />
                    <span className={`text-[12px] font-semibold truncate max-w-[80px] ${
                      isCurrent ? 'text-foreground' : 'text-muted-foreground/50'
                    }`}>
                      {player.name}
                    </span>
                    {isCurrent && (
                      <motion.span
                        className="text-[9px] text-primary font-bold uppercase tracking-wider ml-auto"
                        initial={{ opacity: 0, x: -4 }}
                        animate={{ opacity: 1, x: 0 }}
                      >
                        ●
                      </motion.span>
                    )}
                  </motion.div>
                );
              })}
            </div>

            {/* Dice */}
            <DiceArea
              dice={gameState.dice}
              lockedDice={gameState.lockedDice}
              rollsLeft={gameState.rollsLeft}
              isRolling={gameState.isRolling}
              onToggleLock={toggleLock}
            />

            {/* Bottom: Home above, Roll button below */}
            <div className="flex flex-col items-center gap-3 mt-4 sm:mt-6">
              <button
                onClick={() => navigate('/')}
                className="p-3 rounded-full bg-secondary/60 hover:bg-secondary active:bg-secondary/90 transition-colors touch-manipulation"
                style={{ WebkitTapHighlightColor: 'transparent' }}
                title="Till menyn"
              >
                <Home className="w-4 h-4 text-muted-foreground" />
              </button>

              <motion.button
                onClick={handleRoll}
                disabled={!canRoll || gameState.isRolling}
                className={`w-[84px] h-[84px] rounded-full font-display font-bold text-[15px] tracking-wide transition-all flex items-center justify-center touch-manipulation ${
                  canRoll && !gameState.isRolling
                    ? 'bg-gradient-to-b from-primary to-game-gold-dark text-primary-foreground shadow-[0_8px_32px_-4px_hsl(42_88%_52%/0.45),0_4px_16px_-2px_hsl(0_0%_0%/0.45)]'
                    : 'bg-secondary text-muted-foreground shadow-none'
                }`}
                style={{ WebkitTapHighlightColor: 'transparent' }}
                animate={
                  canRoll && !gameState.isRolling
                    ? { scale: [1, 1.06, 1] }
                    : {}
                }
                transition={
                  canRoll && !gameState.isRolling
                    ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' }
                    : {}
                }
                whileTap={canRoll ? { scale: 0.93 } : {}}
              >
                {gameState.rollsLeft === 3 ? 'Kasta' : gameState.rollsLeft === 0 ? '—' : 'Kasta'}
              </motion.button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
