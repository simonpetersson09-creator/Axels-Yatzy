import { useEffect, useCallback, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useYatzyGame } from '@/hooks/useYatzyGame';
import { DiceArea } from '@/components/game/DiceArea';
import { ScoreBoard, type ScoreboardClickDebug } from '@/components/game/ScoreBoard';
import { YatzyCelebration } from '@/components/game/YatzyCelebration';
import { ForfeitButton } from '@/components/game/ForfeitButton';
import { getTotalScore } from '@/lib/yatzy-scoring';
import { setActiveGame, clearActiveGame } from '@/lib/active-game';
import { recordGameResult } from '@/lib/local-stats';
import { playRollSound } from '@/lib/dice-sounds';
import { aiDecideLocks, aiPickCategory } from '@/lib/yatzy-ai';
import { getProfileAvatar, useProfileSubscription } from '@/lib/profile';
import { GameOverOverlay } from '@/components/game/GameOverOverlay';
import { CombinationCelebration } from '@/components/game/CombinationCelebration';
import { useCombinationCelebration } from '@/hooks/useCombinationCelebration';
import { motion } from 'framer-motion';
import { useTranslation } from '@/lib/i18n';
import { Home } from 'lucide-react';

export default function GamePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
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
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => getProfileAvatar());
  useEffect(() => useProfileSubscription(() => setAvatarUrl(getProfileAvatar())), []);

  const autoRollRef = useRef<string | null>(null);
  const pressedButtonRef = useRef<'kasta' | 'home' | 'forfeit' | null>(null);
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
      const yatzys = (gameState.players[0].scores as Record<string, number | null | undefined>)?.yatzy === 50 ? 1 : 0;
      recordGameResult(humanScore, won, yatzys);
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

  // Force full re-layout on orientation change / viewport resize.
  // iOS Safari/Capacitor doesn't always recompute 100dvh, fixed positions,
  // or safe-area insets after rotating back to portrait. Bumping a key
  // remounts the layout tree so every dimension is measured fresh.
  const [orientationKey, setOrientationKey] = useState(0);
  useEffect(() => {
    let raf = 0;
    const bump = () => {
      cancelAnimationFrame(raf);
      // Wait two frames so Safari has finished recomputing dvh / safe-area
      raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => setOrientationKey((k) => k + 1));
      });
    };
    window.addEventListener('orientationchange', bump);
    window.addEventListener('resize', bump);
    // visualViewport fires more reliably on iOS than resize/orientationchange
    window.visualViewport?.addEventListener('resize', bump);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('orientationchange', bump);
      window.removeEventListener('resize', bump);
      window.visualViewport?.removeEventListener('resize', bump);
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
        const locks = aiDecideLocks(gs.dice, currentPlayer.scores, gs.rollsLeft);
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

  const handleSelectCategory = useCallback((categoryId: string, debug?: ScoreboardClickDebug) => {
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
    console.log('scoreboard-save-request', {
      clickedRowText: debug?.rowText ?? null,
      clickedCategoryId: debug?.clickedCategoryId ?? categoryId,
      renderedRowIndex: debug?.renderedRowIndex ?? null,
      actualSavedCategory: categoryId,
      currentPlayer: gameState.players[gameState.currentPlayerIndex]?.name ?? null,
      score: debug?.score ?? null,
    });
    selectCategory(categoryId as any, debug);
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
      key={orientationKey}
      className="ios-game-layout app-fixed-screen flex items-start justify-center overflow-hidden overscroll-none touch-none"
      style={{
        WebkitOverflowScrolling: 'auto',
        padding: '10px max(10px, env(safe-area-inset-right)) 0 max(10px, env(safe-area-inset-left))',
        boxSizing: 'border-box',
      }}
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
      <motion.div
        className="ios-game-card relative flex flex-col gap-2"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <div className="flex w-full max-w-full gap-1 items-start mt-[50px] mb-0">
          {/* Left: Scoreboard */}
          <div className="ios-score-zone flex flex-col gap-3 self-start">
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

          <div className="ios-side-zone flex w-[108px] flex-shrink-0 flex-col gap-2 self-start">
            {/* Player indicators */}
            <div className="flex flex-col gap-1 h-[124px]">
              {gameState.players.map((player, idx) => {
                const isCurrent = idx === gameState.currentPlayerIndex;
                const color = PLAYER_COLORS[idx];
                const label = `P${idx + 1}`;
                const isHuman = idx === HUMAN_INDEX && !aiPlayers.includes(idx);
                const showAvatar = isHuman && !!avatarUrl;
                return (
                  <motion.div
                    key={player.id}
                    className={`flex items-center gap-2.5 px-2 py-1 rounded-xl transition-all ${
                      isCurrent ? 'bg-secondary/80' : ''
                    }`}
                    animate={isCurrent ? { scale: 1.05 } : { scale: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  >
                    <div className={`w-5 h-5 rounded-full overflow-hidden ${showAvatar ? 'bg-secondary' : color.bg} ring-2 ring-offset-2 ring-offset-background ${
                      isCurrent ? `${color.ring} ${color.glow}` : 'ring-transparent'
                    } transition-all flex items-center justify-center`}>
                      {showAvatar ? (
                        <img src={avatarUrl!} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[8px] font-black text-white/90 leading-none">{label}</span>
                      )}
                    </div>
                    <span className={`text-[12px] font-semibold truncate max-w-[64px] ${
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
              compact
            />

            {/* Bottom: Roll + Home + Forfeit */}
            <div
              className="ios-action-zone flex flex-col items-center gap-2"
              style={{ isolation: 'isolate', marginTop: '60px' }}
            >
              <button
                type="button"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  pressedButtonRef.current = 'kasta';
                  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  if (pressedButtonRef.current !== 'kasta') return;
                  pressedButtonRef.current = null;
                  if (canRoll && !gameState.isRolling) handleRoll();
                }}
                onPointerCancel={() => { pressedButtonRef.current = null; }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                disabled={!canRoll || gameState.isRolling}
                className={`relative w-[88px] h-[88px] rounded-full font-display font-bold text-[16px] tracking-wide transition-colors duration-200 flex items-center justify-center active:scale-[0.94] ${
                  canRoll && !gameState.isRolling
                    ? 'bg-gradient-to-b from-primary to-game-gold-dark text-primary-foreground shadow-[0_8px_32px_-4px_hsl(42_88%_52%/0.45),0_4px_16px_-2px_hsl(0_0%_0%/0.45)] kasta-pulse'
                    : 'bg-secondary text-muted-foreground shadow-none'
                }`}
                style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation', zIndex: 1 }}
              >
                <span className="pointer-events-none">
                  {isCurrentAi
                    ? '⏳'
                    : gameState.rollsLeft === 0 ? t('rollNoMore') : t('roll')}
                </span>
              </button>

              <div className="flex items-center justify-center gap-2 w-full mt-0" style={{ position: 'relative', zIndex: 2 }}>
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    pressedButtonRef.current = 'home';
                    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                  }}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    if (pressedButtonRef.current !== 'home') return;
                    pressedButtonRef.current = null;
                    navigate('/');
                  }}
                  onPointerCancel={() => { pressedButtonRef.current = null; }}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  className="inline-flex items-center justify-center px-2 min-h-[32px] rounded-lg text-[10px] font-medium text-primary/85 bg-primary/10 border border-primary/25 active:bg-primary/20 transition-colors duration-200 whitespace-nowrap shadow-[0_2px_8px_-2px_hsl(0_0%_0%/0.4)]"
                  style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
                  title={t('toMenu')}
                  aria-label={t('home')}
                >
                  <span className="pointer-events-none">{t('home')}</span>
                </button>
                <ForfeitButton
                  onConfirm={handleForfeit}
                  playerName={gameState.players.length > 1
                    ? gameState.players.find((_, i) => i !== 0)?.name
                    : undefined
                  }
                  pressedButtonRef={pressedButtonRef}
                />
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
