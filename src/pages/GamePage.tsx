import { useEffect, useCallback, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useYatzyGame } from '@/hooks/useYatzyGame';
import { DiceArea } from '@/components/game/DiceArea';
import { ScoreBoard } from '@/components/game/ScoreBoard';
import { YatzyCelebration } from '@/components/game/YatzyCelebration';
import { ForfeitButton } from '@/components/game/ForfeitButton';
import { getTotalScore } from '@/lib/yatzy-scoring';
import { setActiveGame, clearActiveGame } from '@/lib/active-game';
import { recordGameResult } from '@/lib/local-stats';
import { playRollSound } from '@/lib/dice-sounds';
import { aiDecideLocks, aiPickCategory } from '@/lib/yatzy-ai';
import { GameOverOverlay } from '@/components/game/GameOverOverlay';
import { FullHouseCelebration } from '@/components/game/FullHouseCelebration';
import { SmallStraightCelebration } from '@/components/game/SmallStraightCelebration';
import { calculateScore } from '@/lib/yatzy-scoring';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, Bot } from 'lucide-react';

export default function GamePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { gameState, startGame, roll, toggleLock, setLocks, getPossibleScores, selectCategory } = useYatzyGame();

  const playerNames: string[] = location.state?.playerNames || ['Spelare 1'];
  const incomingAiPlayers: number[] | undefined = location.state?.aiPlayers;
  
  // Persist aiPlayers to sessionStorage so it survives refreshes
  const [aiPlayers, setAiPlayers] = useState<number[]>(() => {
    if (incomingAiPlayers) return incomingAiPlayers;
    try {
      const saved = sessionStorage.getItem('yatzy-ai-players');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  useEffect(() => {
    if (incomingAiPlayers) {
      setAiPlayers(incomingAiPlayers);
      sessionStorage.setItem('yatzy-ai-players', JSON.stringify(incomingAiPlayers));
    }
  }, [incomingAiPlayers]);

  const autoRollRef = useRef<string | null>(null);
  const aiTurnRef = useRef<string | null>(null);
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;
  const [aiThinking, setAiThinking] = useState(false);
  const [aiChosenCategory, setAiChosenCategory] = useState<string | null>(null);

  const hasStartedRef = useRef(false);
  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    if (location.state?.playerNames || !gameState) {
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
      // Record local stats for human player (index 0)
      const humanScore = getTotalScore(gameState.players[0].scores);
      const allScores = gameState.players.map(p => getTotalScore(p.scores));
      const maxScore = Math.max(...allScores);
      const won = humanScore === maxScore && !aiPlayers.includes(0);
      recordGameResult(humanScore, won);
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
    const delay = 1800 + Math.random() * 800;

    const t = setTimeout(() => {
      const gs = gameStateRef.current;
      if (!gs) return;
      if (gs.rollsLeft === 0) {
        const currentPlayer = gs.players[gs.currentPlayerIndex];
        const cat = aiPickCategory(gs.dice, currentPlayer.scores);
        setAiChosenCategory(cat);
        setAiThinking(false);
        setTimeout(() => {
          selectCategory(cat);
          setAiChosenCategory(null);
        }, 2200);
      } else {
        const currentPlayer = gs.players[gs.currentPlayerIndex];
        const locks = aiDecideLocks(gs.dice, currentPlayer.scores);
        setLocks(locks);
        setTimeout(() => {
          playRollSound();
          roll();
        }, 1000);
      }
    }, delay);

    return () => clearTimeout(t);
  }, [gameState?.currentPlayerIndex, gameState?.round, gameState?.rollsLeft, gameState?.isRolling, gameState?.gameOver, aiPlayers, roll, selectCategory, setLocks]);

  const [showYatzyCelebration, setShowYatzyCelebration] = useState(false);
  const [showFullHouse, setShowFullHouse] = useState(false);
  const [showSmallStraight, setShowSmallStraight] = useState(false);
  const prevIsRollingRef = useRef(false);

  // Detect combinations when dice stop rolling
  useEffect(() => {
    if (!gameState) return;
    const wasRolling = prevIsRollingRef.current;
    prevIsRollingRef.current = gameState.isRolling;
    if (wasRolling && !gameState.isRolling) {
      const currentPlayer = gameState.players[gameState.currentPlayerIndex];
      // Full house
      if (calculateScore(gameState.dice, 'fullHouse') > 0 && currentPlayer.scores['fullHouse'] == null) {
        setShowFullHouse(true);
        setTimeout(() => setShowFullHouse(false), 450);
      }
      // Small straight
      if (calculateScore(gameState.dice, 'smallStraight') > 0 && currentPlayer.scores['smallStraight'] == null) {
        setShowSmallStraight(true);
        setTimeout(() => setShowSmallStraight(false), 350);
      }
    }
  }, [gameState?.isRolling]);

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
        forfeitPlayerName: gameState.players[0].name,
        aiPlayers,
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

  const handlePlayAgain = useCallback(() => {
    startGame(playerNames);
  }, [startGame, playerNames]);

  const handleBackToMenu = useCallback(() => {
    navigate('/');
  }, [navigate]);

  if (!gameState) return null;

  const gameOverResults = gameState.gameOver
    ? gameState.players.map(p => ({ name: p.name, score: getTotalScore(p.scores) }))
    : [];

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
      <GameOverOverlay
        show={gameState.gameOver}
        players={gameOverResults}
        aiPlayers={aiPlayers}
        onPlayAgain={handlePlayAgain}
        onBackToMenu={handleBackToMenu}
      />
      <YatzyCelebration
        show={showYatzyCelebration}
        onComplete={() => setShowYatzyCelebration(false)}
      />
      <FullHouseCelebration show={showFullHouse} />
      <SmallStraightCelebration show={showSmallStraight} />
      <motion.div
        className="flex flex-col gap-4"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        {/* AI thinking indicator */}
        <AnimatePresence>
          {(aiThinking || aiChosenCategory) && (
            <motion.div
              className="flex items-center justify-center gap-2 py-2"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              <Bot className="w-4 h-4 text-game-info animate-pulse" />
              <span className="text-[12px] text-game-info font-medium">
                {aiChosenCategory
                  ? `${currentPlayer.name} väljer...`
                  : `${currentPlayer.name} tänker...`}
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
                aiChosenCategory={aiChosenCategory}
              />
            </div>

            {/* Roll indicator */}
            <div className="flex items-center justify-center gap-2 py-1">
              {isCurrentAi ? (
                <span className="text-[11px] text-muted-foreground/60 font-medium">
                  {currentPlayer.name} spelar...
                </span>
              ) : gameState.rollsLeft === 3 ? (
                <span className="text-[11px] text-muted-foreground/40">&nbsp;</span>
              ) : gameState.rollsLeft === 0 ? (
                <div className="flex flex-col items-center gap-1.5">
                  <div className="flex gap-1.5">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="w-2.5 h-2.5 rounded-full bg-muted-foreground/20" />
                    ))}
                  </div>
                  <span className="text-[10px] text-primary font-semibold tracking-wide animate-pulse">
                    Välj kategori ▸
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1.5">
                  <div className="flex gap-1.5">
                    {[0, 1, 2].map(i => (
                      <div
                        key={i}
                        className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                          i < 3 - gameState.rollsLeft
                            ? 'bg-primary shadow-[0_0_6px_hsl(var(--primary)/0.5)]'
                            : 'bg-muted-foreground/20'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-[10px] text-muted-foreground/50 font-medium tabular-nums">
                    {gameState.rollsLeft} kast kvar
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {/* Player indicators */}
            <div className="flex flex-col gap-2">
              {gameState.players.map((player, idx) => {
                const isCurrent = idx === gameState.currentPlayerIndex;
                const color = PLAYER_COLORS[idx];
                const label = `P${idx + 1}`;
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
                    } transition-all flex items-center justify-center`}>
                      <span className="text-[8px] font-black text-white/90 leading-none">{label}</span>
                    </div>
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
