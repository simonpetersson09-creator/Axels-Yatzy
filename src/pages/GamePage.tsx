import { useEffect, useCallback, useState, useRef, useLayoutEffect } from 'react';
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
import { CombinationCelebration } from '@/components/game/CombinationCelebration';
import { useCombinationCelebration } from '@/hooks/useCombinationCelebration';
import { motion } from 'framer-motion';
import { Home } from 'lucide-react';

export default function GamePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { gameState, startGame, roll, toggleLock, setLocks, getPossibleScores, selectCategory } = useYatzyGame();

  const incomingPlayerNames: string[] | undefined = location.state?.playerNames;
  const incomingAiPlayers: number[] | undefined = location.state?.aiPlayers;
  
  // Persist playerNames and aiPlayers to localStorage so they survive app suspension/refresh
  const [playerNames, setPlayerNames] = useState<string[]>(() => {
    if (incomingPlayerNames) return incomingPlayerNames;
    try {
      const saved = localStorage.getItem('yatzy-player-names');
      return saved ? JSON.parse(saved) : ['Spelare 1'];
    } catch { return ['Spelare 1']; }
  });

  const [aiPlayers, setAiPlayers] = useState<number[]>(() => {
    if (incomingAiPlayers) return incomingAiPlayers;
    try {
      const saved = localStorage.getItem('yatzy-ai-players');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  useEffect(() => {
    if (incomingPlayerNames) {
      setPlayerNames(incomingPlayerNames);
      localStorage.setItem('yatzy-player-names', JSON.stringify(incomingPlayerNames));
    }
    if (incomingAiPlayers) {
      setAiPlayers(incomingAiPlayers);
      localStorage.setItem('yatzy-ai-players', JSON.stringify(incomingAiPlayers));
    }
  }, [incomingPlayerNames, incomingAiPlayers]);

  // Human is always player index 0 in this app
  const HUMAN_INDEX = 0;

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

  useEffect(() => {
    document.documentElement.classList.add('game-scroll-lock');
    document.body.classList.add('game-scroll-lock');
    document.getElementById('root')?.classList.add('game-scroll-lock');

    const preventScroll = (event: TouchEvent) => {
      event.preventDefault();
    };

    document.addEventListener('touchmove', preventScroll, { passive: false });

    return () => {
      document.removeEventListener('touchmove', preventScroll);
      document.documentElement.classList.remove('game-scroll-lock');
      document.body.classList.remove('game-scroll-lock');
      document.getElementById('root')?.classList.remove('game-scroll-lock');
    };
  }, []);

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
    }, 600);
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
    const delay = 1400 + Math.random() * 600;

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
        }, 2600);
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
  const activeCelebration = useCombinationCelebration(gameState);

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
    if (!gameState) return;
    // Hard guard: in any game with AI opponents, the human only controls index 0.
    // Prevents scoring for AI players if app was suspended and aiPlayers list was lost.
    if (aiPlayers.length > 0 && gameState.currentPlayerIndex !== HUMAN_INDEX) return;
    if (aiPlayers.includes(gameState.currentPlayerIndex)) return;
    if (categoryId === 'yatzy') {
      const dice = gameState.dice;
      const allSame = dice.every(d => d === dice[0]);
      if (allSame) {
        setShowYatzyCelebration(true);
      }
    }
    selectCategory(categoryId as any);
  }, [gameState, selectCategory, aiPlayers]);

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
  const possibleScores = gameState.isRolling ? null : getPossibleScores();
  const canRoll = gameState.rollsLeft > 0 && !isCurrentAi;

  const PLAYER_COLORS = [
    { ring: 'ring-yatzy-player1', bg: 'bg-yatzy-player1', glow: 'shadow-[0_0_8px_hsl(36_82%_52%/0.5)]' },
    { ring: 'ring-yatzy-player2', bg: 'bg-yatzy-player2', glow: 'shadow-[0_0_8px_hsl(210_70%_52%/0.5)]' },
    { ring: 'ring-yatzy-player3', bg: 'bg-yatzy-player3', glow: 'shadow-[0_0_8px_hsl(155_60%_42%/0.5)]' },
    { ring: 'ring-yatzy-player4', bg: 'bg-yatzy-player4', glow: 'shadow-[0_0_8px_hsl(350_65%_52%/0.5)]' },
  ];

  return (
    <div
      className="h-[100dvh] max-h-[100dvh] px-2 sm:px-4 py-2 sm:py-6 safe-top safe-bottom flex items-center justify-center overflow-hidden overscroll-none touch-none"
      style={{ WebkitOverflowScrolling: 'auto' }}
    >
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
      <FitScaler maxScale={1.3}>
      <motion.div
        className="relative flex flex-col gap-2 sm:gap-4"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <div className="flex gap-2 sm:gap-6 items-center -translate-x-2 sm:translate-x-0">
          {/* Left: Scoreboard */}
          <div className="flex flex-col gap-3">
            <div className="relative game-shadow-soft rounded-lg overflow-hidden">
              <ScoreBoard
                players={gameState.players}
                currentPlayerIndex={gameState.currentPlayerIndex}
                possibleScores={possibleScores}
                onSelectCategory={handleSelectCategory}
                rollsLeft={gameState.rollsLeft}
                aiChosenCategory={aiChosenCategory}
                selectionDisabled={isCurrentAi}
              />
              <CombinationCelebration type={activeCelebration} />
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:gap-4">
            {/* Player indicators */}
            <div className="flex flex-col gap-1 sm:gap-2">
              {gameState.players.map((player, idx) => {
                const isCurrent = idx === gameState.currentPlayerIndex;
                const color = PLAYER_COLORS[idx];
                const label = `P${idx + 1}`;
                return (
                  <motion.div
                    key={player.id}
                    className={`flex items-center gap-2.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl transition-all ${
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

            {/* Bottom: Roll + Home + Forfeit */}
            <div className="flex flex-col items-center gap-2 -mt-12 sm:mt-12 -translate-y-8 sm:translate-y-0">
              <motion.button
                onClick={handleRoll}
                disabled={!canRoll || gameState.isRolling}
                className={`w-[68px] h-[68px] sm:w-[92px] sm:h-[92px] rounded-full font-display font-bold text-[13px] sm:text-[16px] tracking-wide transition-all duration-300 flex items-center justify-center touch-manipulation ${
                  canRoll && !gameState.isRolling
                    ? 'bg-gradient-to-b from-primary to-game-gold-dark text-primary-foreground shadow-[0_8px_32px_-4px_hsl(42_88%_52%/0.45),0_4px_16px_-2px_hsl(0_0%_0%/0.45)]'
                    : 'bg-secondary text-muted-foreground shadow-none'
                }`}
                style={{ WebkitTapHighlightColor: 'transparent' }}
                animate={
                  canRoll && !gameState.isRolling
                    ? { scale: [1, 1.05, 1] }
                    : {}
                }
                transition={
                  canRoll && !gameState.isRolling
                    ? { duration: 2.4, repeat: Infinity, ease: [0.45, 0, 0.55, 1] }
                    : {}
                }
                whileTap={canRoll ? { scale: 0.92, transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] } } : {}}
              >
                {isCurrentAi
                  ? '⏳'
                  : gameState.rollsLeft === 3 ? 'Kasta' : gameState.rollsLeft === 0 ? '—' : 'Kasta'}
              </motion.button>

              <div className="flex items-center gap-1.5">
                <motion.button
                  onClick={() => navigate('/')}
                  className="p-2.5 rounded-full bg-secondary/60 hover:bg-secondary transition-colors duration-300 touch-manipulation"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                  whileTap={{ scale: 0.92, transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] } }}
                  title="Till menyn"
                  aria-label="Till menyn"
                >
                  <Home className="w-3.5 h-3.5 text-muted-foreground" />
                </motion.button>
                <ForfeitButton
                  onConfirm={handleForfeit}
                  playerName={gameState.players.length > 1
                    ? gameState.players.find((_, i) => i !== 0)?.name
                    : undefined
                  }
                />
              </div>
            </div>
          </div>
        </div>
      </motion.div>
      </FitScaler>
    </div>
  );
}

function FitScaler({ children, maxScale = 1.15 }: { children: React.ReactNode; maxScale?: number }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const compute = () => {
      const ow = outer.clientWidth;
      const oh = outer.clientHeight;
      const iw = inner.scrollWidth;
      const ih = inner.scrollHeight;
      if (!iw || !ih) return;
      const s = Math.min(maxScale, ow / iw, oh / ih);
      setScale(s > 0 ? s : 1);
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(outer);
    ro.observe(inner);
    window.addEventListener('resize', compute);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', compute);
    };
  }, [maxScale]);

  return (
    <div ref={outerRef} className="w-full h-full flex items-center justify-center overflow-hidden">
      <div
        ref={innerRef}
        style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}
      >
        {children}
      </div>
    </div>
  );
}
