import { useEffect, useCallback, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useYatzyGame } from '@/hooks/useYatzyGame';
import { DiceArea } from '@/components/game/DiceArea';
import { ScoreBoard } from '@/components/game/ScoreBoard';
import { YatzyCelebration } from '@/components/game/YatzyCelebration';
import { ForfeitButton } from '@/components/game/ForfeitButton';
import { getTotalScore } from '@/lib/yatzy-scoring';
import { setActiveGame, clearActiveGame } from '@/lib/active-game';
import { playRollSound } from '@/lib/dice-sounds';
import { aiDecideLocks, aiPickCategory } from '@/lib/yatzy-ai';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, Bot } from 'lucide-react';

export default function GamePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { gameState, startGame, roll, toggleLock, setLocks, getPossibleScores, selectCategory } = useYatzyGame();

  const playerNames: string[] = location.state?.playerNames || ['Spelare 1'];
  const aiPlayers: number[] = location.state?.aiPlayers || []; // indices of AI players
  const autoRollRef = useRef<string | null>(null);
  const aiTurnRef = useRef<string | null>(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [aiChosenCategory, setAiChosenCategory] = useState<string | null>(null);

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

  // AI auto-play
  useEffect(() => {
    if (!gameState || gameState.gameOver || gameState.isRolling) return;
    const isAi = aiPlayers.includes(gameState.currentPlayerIndex);
    if (!isAi) {
      setAiThinking(false);
      setAiChosenCategory(null);
      return;
    }
    if (gameState.rollsLeft === 3) return; // wait for auto-roll first

    const aiKey = `${gameState.currentPlayerIndex}-${gameState.round}-${gameState.rollsLeft}`;
    if (aiTurnRef.current === aiKey) return;
    aiTurnRef.current = aiKey;

    setAiThinking(true);
    const delay = 1000 + Math.random() * 600; // 1000-1600ms (slower)

    const t = setTimeout(() => {
      if (gameState.rollsLeft === 0) {
        // Pick category — show it highlighted first, then confirm after delay
        const currentPlayer = gameState.players[gameState.currentPlayerIndex];
        const cat = aiPickCategory(gameState.dice, currentPlayer.scores);
        setAiChosenCategory(cat);
        setAiThinking(false);
        // Wait so the player can see the choice
        setTimeout(() => {
          selectCategory(cat);
          setAiChosenCategory(null);
        }, 1500);
      } else {
        // Decide locks then roll
        const currentPlayer = gameState.players[gameState.currentPlayerIndex];
        const locks = aiDecideLocks(gameState.dice, currentPlayer.scores);
        setLocks(locks);
        // Longer delay then roll
        setTimeout(() => {
          playRollSound();
          roll();
        }, 600);
      }
    }, delay);

    return () => clearTimeout(t);
  }, [gameState?.currentPlayerIndex, gameState?.round, gameState?.rollsLeft, gameState?.isRolling, gameState?.gameOver, aiPlayers, gameState, roll, selectCategory, setLocks]);

  const [showYatzyCelebration, setShowYatzyCelebration] = useState(false);

  const handleForfeit = useCallback(() => {
    if (!gameState) return;
    clearActiveGame();
    const results = gameState.players.map(p => ({
      name: p.name,
      score: getTotalScore(p.scores),
      scores: p.scores,
    }));
    navigate('/results', {
      state: {
        results,
        forfeit: true,
        forfeitPlayerName: gameState.players[0].name, // human is always player 0
      },
    });
  }, [gameState, navigate]);

  const handleRoll = useCallback(() => {
    playRollSound();
    roll();
  }, [roll]);

  const handleSelectCategory = useCallback((categoryId: string) => {
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
  const isCurrentAi = aiPlayers.includes(gameState.currentPlayerIndex);
  const possibleScores = gameState.isRolling || isCurrentAi ? null : getPossibleScores();
  const canRoll = gameState.rollsLeft > 0 && !isCurrentAi;

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
        {/* AI thinking indicator */}
        <AnimatePresence>
          {aiThinking && (
            <motion.div
              className="flex items-center justify-center gap-2 py-2"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              <Bot className="w-4 h-4 text-game-info animate-pulse" />
              <span className="text-[12px] text-game-info font-medium">
                {currentPlayer.name} tänker...
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Scoreboard + Players + Dice */}
        <div className="flex gap-3 sm:gap-6 items-start">
          {/* Left: Scoreboard */}
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
              {isCurrentAi
                ? `${currentPlayer.name} spelar...`
                : gameState.rollsLeft === 3
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
                const isAi = aiPlayers.includes(idx);
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
                    {isAi && (
                      <Bot className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />
                    )}
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
              onToggleLock={isCurrentAi ? () => {} : toggleLock}
            />

            {/* Bottom: Forfeit + Home + Roll button */}
            <div className="flex flex-col items-center gap-3 mt-4 sm:mt-6">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate('/')}
                  className="p-3 rounded-full bg-secondary/60 hover:bg-secondary active:bg-secondary/90 transition-colors touch-manipulation"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                  title="Till menyn"
                >
                  <Home className="w-4 h-4 text-muted-foreground" />
                </button>
                <ForfeitButton
                  onConfirm={handleForfeit}
                  playerName={gameState.players.length > 1
                    ? gameState.players.find((_, i) => i !== 0)?.name
                    : undefined
                  }
                />
              </div>

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
                {isCurrentAi
                  ? '⏳'
                  : gameState.rollsLeft === 3 ? 'Kasta' : gameState.rollsLeft === 0 ? '—' : 'Kasta'}
              </motion.button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
