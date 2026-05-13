import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMultiplayerGame } from '@/hooks/useMultiplayerGame';
import { DiceArea } from '@/components/game/DiceArea';
import { ScoreBoard } from '@/components/game/ScoreBoard';
import { ForfeitButton } from '@/components/game/ForfeitButton';
import { YatzyCelebration } from '@/components/game/YatzyCelebration';
import { CombinationCelebration } from '@/components/game/CombinationCelebration';
import { useCombinationCelebration } from '@/hooks/useCombinationCelebration';
import { getTotalScore } from '@/lib/yatzy-scoring';
import { setActiveGame, clearActiveGame } from '@/lib/active-game';
import { recordGameResult } from '@/lib/local-stats';
import { playRollSound } from '@/lib/dice-sounds';
import { QuickChat } from '@/components/game/QuickChat';
import { getProfileName } from '@/lib/profile';
import { getProfileAvatar, useProfileSubscription } from '@/lib/profile';
import { motion } from 'framer-motion';
import { useTranslation } from '@/lib/i18n';
import { trackEvent } from '@/lib/analytics';
import { saveFriendMatchResult } from '@/lib/friend-stats';
import { supabase } from '@/integrations/supabase/client';

export default function MultiplayerGamePage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const {
    gameState, gameCode, status, myPlayerIndex, isMyTurn, error, localRolling,
    roll, toggleLock, getPossibleScores, selectCategory, rejoinGame, forfeitGame,
  } = useMultiplayerGame();

  const gameId = searchParams.get('gameId');
  const statsRecordedRef = useRef(false);
  const rejoinCalledRef = useRef<string | null>(null);
  const pressedButtonRef = useRef<'kasta' | 'home' | 'forfeit' | null>(null);
  const autoRollRef = useRef<string | null>(null);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => getProfileAvatar());
  useEffect(() => useProfileSubscription(() => setAvatarUrl(getProfileAvatar())), []);

  const [showYatzyCelebration, setShowYatzyCelebration] = useState(false);
  const activeCelebration = useCombinationCelebration(gameState);

  useEffect(() => {
    if (gameId && !gameState && rejoinCalledRef.current !== gameId) {
      rejoinCalledRef.current = gameId;
      rejoinGame(gameId);
    }
  }, [gameId, gameState, rejoinGame]);

  // Track active game
  useEffect(() => {
    if (gameId && status === 'playing') {
      setActiveGame({ type: 'multiplayer', gameId, timestamp: Date.now() });
    }
    if (status === 'finished') {
      clearActiveGame();
    }
  }, [gameId, status]);

  // Scroll-lock + touchmove prevent (same as GamePage)
  useEffect(() => {
    document.documentElement.classList.add('game-scroll-lock');
    document.body.classList.add('game-scroll-lock');
    document.getElementById('root')?.classList.add('game-scroll-lock');
    const preventScroll = (e: TouchEvent) => e.preventDefault();
    document.addEventListener('touchmove', preventScroll, { passive: false });
    return () => {
      document.removeEventListener('touchmove', preventScroll);
      document.documentElement.classList.remove('game-scroll-lock');
      document.body.classList.remove('game-scroll-lock');
      document.getElementById('root')?.classList.remove('game-scroll-lock');
    };
  }, []);

  // Force full re-layout on orientation/viewport change (iOS Safari/Capacitor fix)
  const [orientationKey, setOrientationKey] = useState(0);
  useEffect(() => {
    let raf = 0;
    const bump = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => setOrientationKey((k) => k + 1));
      });
    };
    window.addEventListener('orientationchange', bump);
    window.addEventListener('resize', bump);
    window.visualViewport?.addEventListener('resize', bump);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('orientationchange', bump);
      window.removeEventListener('resize', bump);
      window.visualViewport?.removeEventListener('resize', bump);
    };
  }, []);

  // Handle game finished — record stats and navigate to results (single source of truth)
  useEffect(() => {
    if (status === 'finished' && gameState && !statsRecordedRef.current) {
      statsRecordedRef.current = true;

      const results = gameState.players.map(p => ({
        name: p.name,
        score: getTotalScore(p.scores),
        scores: p.scores,
      }));

      const isForfeit = !!gameState.forfeitedBy;

      if (myPlayerIndex !== null && myPlayerIndex >= 0) {
        const me = gameState.players[myPlayerIndex];
        const myScore = results[myPlayerIndex]?.score ?? 0;
        let won: boolean;
        if (isForfeit) {
          // Winner is anyone who did NOT forfeit
          won = me?.name !== gameState.forfeitedBy;
        } else {
          const topScore = Math.max(...results.map(r => r.score));
          won = myScore === topScore && myScore > 0;
        }
        const yatzys = (me?.scores as Record<string, number | null | undefined>)?.yatzy === 50 ? 1 : 0;
        recordGameResult(myScore, won, yatzys);
        trackEvent('game_finished', { won, score: myScore, forfeit: isForfeit }, { gameId: gameId ?? undefined, gameMode: 'multiplayer' });

        // Save head-to-head friend stats — only host writes (avoids duplicates),
        // only for true 1v1 multiplayer matches.
        if (myPlayerIndex === 0 && gameState.players.length === 2 && gameId) {
          (async () => {
            try {
              const { data: rows } = await supabase
                .from('game_players')
                .select('player_index, session_id')
                .eq('game_id', gameId);
              const idMap = new Map<number, string>();
              (rows ?? []).forEach((r: any) => idMap.set(r.player_index, r.session_id));
              const p1 = gameState.players[0];
              const p2 = gameState.players[1];
              const s1 = results[0].score;
              const s2 = results[1].score;
              const id1 = idMap.get(0) ?? `anon-${gameId}-0`;
              const id2 = idMap.get(1) ?? `anon-${gameId}-1`;
              let winnerId: string | null = null;
              if (isForfeit) {
                winnerId = p1.name === gameState.forfeitedBy ? id2
                  : p2.name === gameState.forfeitedBy ? id1 : null;
              } else if (s1 !== s2) {
                winnerId = s1 > s2 ? id1 : id2;
              }
              saveFriendMatchResult({
                gameId,
                player1: { id: id1, name: p1.name, score: s1 },
                player2: { id: id2, name: p2.name, score: s2 },
                winnerId,
              });
            } catch (err) {
              console.warn('[friend-stats] could not record match', err);
            }
          })();
        }
      }

      clearActiveGame();

      navigate('/results', {
        state: {
          results,
          isMultiplayer: true,
          ...(isForfeit ? { forfeit: true, forfeitPlayerName: gameState.forfeitedBy } : {}),
        },
      });
    }
  }, [status, gameState, myPlayerIndex, navigate]);

  if (error) {
    return (
      <div className="app-screen flex items-center justify-center px-6 safe-top safe-bottom">
        <div className="text-center space-y-4 max-w-sm">
          <p className="text-destructive font-semibold">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 rounded-2xl bg-primary text-primary-foreground font-display font-bold"
          >
            {t('backToMenu')}
          </button>
        </div>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div className="app-screen flex items-center justify-center safe-top safe-bottom">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">{t('loadingGame')}</p>
        </div>
      </div>
    );
  }

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const possibleScores = isMyTurn && !localRolling ? getPossibleScores() : null;
  const canRoll = gameState.rollsLeft > 0 && isMyTurn;

  const PLAYER_COLORS = [
    { ring: 'ring-yatzy-player1', bg: 'bg-yatzy-player1', glow: 'shadow-[0_0_8px_hsl(36_82%_52%/0.5)]' },
    { ring: 'ring-yatzy-player2', bg: 'bg-yatzy-player2', glow: 'shadow-[0_0_8px_hsl(210_70%_52%/0.5)]' },
    { ring: 'ring-yatzy-player3', bg: 'bg-yatzy-player3', glow: 'shadow-[0_0_8px_hsl(155_60%_42%/0.5)]' },
    { ring: 'ring-yatzy-player4', bg: 'bg-yatzy-player4', glow: 'shadow-[0_0_8px_hsl(350_65%_52%/0.5)]' },
  ];

  const handleRoll = () => {
    playRollSound();
    roll();
  };

  const handleSelectCategory = (categoryId: string) => {
    if (!isMyTurn) return;
    if (categoryId === 'yatzy') {
      const allSame = gameState.dice.every(d => d === gameState.dice[0]);
      if (allSame) {
        setShowYatzyCelebration(true);
        trackEvent('yatzy_scored', undefined, { gameId: gameId ?? undefined, gameMode: 'multiplayer' });
      }
    }
    selectCategory(categoryId as any);
  };

  const handleForfeit = async () => {
    // Just call the RPC — the status==='finished' effect handles stats + navigation
    try {
      await forfeitGame();
    } catch (err) {
      console.error('Forfeit failed:', err);
    }
  };

  const opponentName = myPlayerIndex !== null && gameState.players.length > 1
    ? gameState.players.filter((_, i) => i !== myPlayerIndex).map(p => p.name).join(', ')
    : undefined;

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
      <YatzyCelebration
        show={showYatzyCelebration}
        onComplete={() => setShowYatzyCelebration(false)}
      />
      {gameId && (
        <QuickChat
          gameId={gameId}
          myPlayerIndex={myPlayerIndex}
          myName={(myPlayerIndex !== null ? gameState.players[myPlayerIndex]?.name : null) || getProfileName() || 'Du'}
        />
      )}
      <motion.div
        className="ios-game-card relative flex flex-col gap-2"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        {gameCode && (
          <p className="text-center text-[9px] text-muted-foreground/50 font-mono tracking-wider mt-1">
            {t('codeLabel', { code: gameCode })}
          </p>
        )}

        <div className="flex w-full max-w-full gap-1 items-start mt-[40px] mb-0">
          {/* Left: Scoreboard */}
          <div className="ios-score-zone flex flex-col gap-3 self-start">
            <div className="relative game-shadow-soft rounded-lg overflow-hidden">
              <ScoreBoard
                players={gameState.players}
                currentPlayerIndex={gameState.currentPlayerIndex}
                possibleScores={possibleScores}
                onSelectCategory={handleSelectCategory}
                rollsLeft={gameState.rollsLeft}
                selectionDisabled={!isMyTurn}
              />
              <CombinationCelebration type={activeCelebration} />
            </div>
          </div>

          <div className="ios-side-zone flex w-[108px] flex-shrink-0 flex-col gap-2 self-start">
            {/* Player indicators */}
            <div className="flex flex-col gap-1 h-[124px]">
              {gameState.players.map((player, idx) => {
                const isCurrent = idx === gameState.currentPlayerIndex;
                const isMe = idx === myPlayerIndex;
                const color = PLAYER_COLORS[idx];
                const label = `P${idx + 1}`;
                const showAvatar = isMe && !!avatarUrl;
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
                      {player.name}{isMe ? ' (du)' : ''}
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
              isRolling={localRolling || gameState.isRolling}
              onToggleLock={isMyTurn ? toggleLock : () => {}}
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
                  if (canRoll && !gameState.isRolling && !localRolling) handleRoll();
                }}
                onPointerCancel={() => { pressedButtonRef.current = null; }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                disabled={!canRoll || gameState.isRolling || localRolling}
                className={`relative w-[88px] h-[88px] rounded-full font-display font-bold text-[16px] tracking-wide transition-colors duration-200 flex items-center justify-center active:scale-[0.94] ${
                  canRoll && !gameState.isRolling && !localRolling
                    ? 'bg-gradient-to-b from-primary to-game-gold-dark text-primary-foreground shadow-[0_8px_32px_-4px_hsl(42_88%_52%/0.45),0_4px_16px_-2px_hsl(0_0%_0%/0.45)] kasta-pulse'
                    : 'bg-secondary text-muted-foreground shadow-none'
                }`}
                style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation', zIndex: 1 }}
              >
                <span className="pointer-events-none text-center leading-tight px-1">
                  {!isMyTurn
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
                  playerName={opponentName}
                  pressedButtonRef={pressedButtonRef}
                />
              </div>

              {!isMyTurn && (
                <p className="text-center text-[10px] text-muted-foreground/70 font-medium px-1 mt-1 leading-tight">
                  {t('waitingForPlayer', { name: currentPlayer.name })}
                </p>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
