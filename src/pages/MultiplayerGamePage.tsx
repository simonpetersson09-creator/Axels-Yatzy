import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMultiplayerGame } from '@/hooks/MultiplayerProvider';
import { DiceArea } from '@/components/game/DiceArea';
import { TurnIndicator } from '@/components/game/TurnIndicator';
import { ScoreBoard } from '@/components/game/ScoreBoard';
import { ForfeitButton } from '@/components/game/ForfeitButton';
import { YatzyCelebration } from '@/components/game/YatzyCelebration';
import { CombinationCelebration } from '@/components/game/CombinationCelebration';
import { useCombinationCelebration } from '@/hooks/useCombinationCelebration';
import { getTotalScore } from '@/lib/yatzy-scoring';
import { CATEGORIES } from '@/types/yatzy';

import { setActiveGame, removeActiveGame } from '@/lib/active-game';
import { recordGameResult } from '@/lib/local-stats';
import { playRollSound } from '@/lib/dice-sounds';
import { playLightHaptic, playDiceLandHaptic, playSuccessHaptic } from '@/lib/haptics';
import { QuickChat } from '@/components/game/QuickChat';
import { TurnTransition } from '@/components/game/TurnTransition';
import { getProfileName } from '@/lib/profile';
import { getProfileAvatar, subscribeProfileChanges } from '@/lib/profile';
import { motion } from 'framer-motion';
import { useTranslation } from '@/lib/i18n';
import { trackEvent } from '@/lib/analytics';
import { saveFriendMatchResult } from '@/lib/friend-stats';
import { supabase } from '@/integrations/supabase/client';
import { getSessionId } from '@/lib/session';

const DEBUG = false;


export default function MultiplayerGamePage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const {
    gameState, gameCode, status, myPlayerIndex, isMyTurn, error,
    localRolling, remoteRolling, pendingCategory, pendingPlayerIndex,
    roll, toggleLock, getPossibleScores, selectCategory, rejoinGame, forfeitGame,
  } = useMultiplayerGame();

  const gameId = searchParams.get('gameId');
  const statsRecordedRef = useRef(false);
  const rejoinCalledRef = useRef<string | null>(null);
  const pressedButtonRef = useRef<'kasta' | 'home' | 'forfeit' | null>(null);
  const autoRollRef = useRef<string | null>(null);
  const autoRollPendingRef = useRef<string | null>(null);
  const autoRollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoRollRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoRollRetryCountRef = useRef<Map<string, number>>(new Map());
  const rollFnRef = useRef(roll);
  useEffect(() => { rollFnRef.current = roll; }, [roll]);
  // Always-current snapshot of gameState/flags so deferred timers (auto-roll
  // retry) don't act on stale closure data when a turn advances within their
  // delay window.
  const liveStateRef = useRef({ gameState, isMyTurn, localRolling, remoteRolling, status });
  useEffect(() => {
    liveStateRef.current = { gameState, isMyTurn, localRolling, remoteRolling, status };
  }, [gameState, isMyTurn, localRolling, remoteRolling, status]);

  const [showTurnTransition, setShowTurnTransition] = useState(false);
  const [glowActive, setGlowActive] = useState(false);
  const prevPlayerRef = useRef<number | null>(null);
  const glowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => getProfileAvatar());
  useEffect(() => subscribeProfileChanges(() => setAvatarUrl(getProfileAvatar())), []);

  const [showYatzyCelebration, setShowYatzyCelebration] = useState(false);
  const { activeCelebration, yatzyTrigger } = useCombinationCelebration(gameState);
  useEffect(() => {
    if (yatzyTrigger > 0) setShowYatzyCelebration(true);
  }, [yatzyTrigger]);

  useEffect(() => {
    if (gameId && !gameState && rejoinCalledRef.current !== gameId) {
      rejoinCalledRef.current = gameId;
      // Reset the guard on failure so the user (or a follow-up effect run)
      // can retry instead of being stuck on an infinite spinner.
      Promise.resolve(rejoinGame(gameId)).catch((err) => {
        console.error('[multiplayer] rejoin failed', err);
        if (rejoinCalledRef.current === gameId) rejoinCalledRef.current = null;
      });
    }
  }, [gameId, gameState, rejoinGame]);

  // If the native app reopens directly into an old finished match URL, the
  // local active-game entry can keep sending the user back into a dead board.
  // Prune that stale route immediately instead of trying to resume it forever.
  useEffect(() => {
    if (!gameId || gameState) return;
    let cancelled = false;

    (async () => {
      try {
        const { data, error } = await supabase
          .from('games')
          .select('status')
          .eq('id', gameId)
          .maybeSingle();

        if (cancelled || error) return;
        if (!data || data.status === 'finished') {
          removeActiveGame(gameId);
          navigate('/', { replace: true });
        }
      } catch {
        // Keep the normal rejoin/error flow for transient network failures.
      }
    })();

    return () => { cancelled = true; };
  }, [gameId, gameState, navigate]);

  // Track active game
  useEffect(() => {
    if (gameId && status === 'playing') {
      const opponent = gameState?.players?.find((_, i) => i !== myPlayerIndex);
      setActiveGame({
        type: 'multiplayer',
        gameId,
        timestamp: Date.now(),
        opponentName: opponent?.name,
      });
      // NOTE: merely opening the match must NOT restart the 48h countdown —
      // the server expires on games.updated_at (real moves only). HomePage
      // syncs lastRollTime from the server timestamps instead.

    }
    if (status === 'finished' && gameId) {
      removeActiveGame(gameId);
    }
  }, [gameId, status, gameState, myPlayerIndex]);


  // Scroll-lock handled by CSS only; avoid global touchmove blockers that can leak into lobby scroll.
  useEffect(() => {
    document.documentElement.classList.add('game-scroll-lock');
    document.body.classList.add('game-scroll-lock');
    document.getElementById('root')?.classList.add('game-scroll-lock');
    return () => {
      document.documentElement.classList.remove('game-scroll-lock');
      document.body.classList.remove('game-scroll-lock');
      document.getElementById('root')?.classList.remove('game-scroll-lock');
    };
  }, []);

  // Cleanup glow timer on unmount
  useEffect(() => {
    return () => {
      if (glowTimerRef.current) clearTimeout(glowTimerRef.current);
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

  // Auto-roll is intentionally not used in multiplayer — both players tap Roll manually.

  // Hard-reset auto-roll bookkeeping when the turn-key changes so a stale
  // success from a previous turn never blocks the next turn's auto-roll.
  const prevTurnKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!gameState) return;
    const key = `${gameState.currentPlayerIndex}-${gameState.round}`;
    if (prevTurnKeyRef.current !== null && prevTurnKeyRef.current !== key) {
      DEBUG && console.log('[auto-roll] turn changed — clearing refs', {
        prev: prevTurnKeyRef.current,
        next: key,
      });
      if (autoRollTimerRef.current) {
        clearTimeout(autoRollTimerRef.current);
        autoRollTimerRef.current = null;
      }
      if (autoRollRetryTimerRef.current) {
        clearTimeout(autoRollRetryTimerRef.current);
        autoRollRetryTimerRef.current = null;
      }
      autoRollPendingRef.current = null;
      autoRollRetryCountRef.current.clear();
      // autoRollRef stays as-is; fire-time guard checks against current key
    }
    prevTurnKeyRef.current = key;
  }, [gameState?.currentPlayerIndex, gameState?.round, gameState]);

  // Cleanup auto-roll timer on unmount
  useEffect(() => {
    return () => {
      if (autoRollTimerRef.current) clearTimeout(autoRollTimerRef.current);
      if (autoRollRetryTimerRef.current) clearTimeout(autoRollRetryTimerRef.current);
    };
  }, []);
  // Detect when turn changes to me and trigger transition overlay + glow.
  // prevPlayerRef gates so we never fire on first observation (load/rejoin).
  useEffect(() => {
    if (!gameState || status !== 'playing' || myPlayerIndex === null) return;
    const current = gameState.currentPlayerIndex;
    const prev = prevPlayerRef.current;
    prevPlayerRef.current = current;

    if (prev === null) return; // first observation — skip
    if (current === myPlayerIndex && prev !== myPlayerIndex) {
      setShowTurnTransition(true);
      setGlowActive(true);
      if (glowTimerRef.current) clearTimeout(glowTimerRef.current);
      glowTimerRef.current = setTimeout(() => setGlowActive(false), 2600);
    }
  }, [gameState?.currentPlayerIndex, status, myPlayerIndex]);

  // YatzyCelebration is now triggered on dice land via useCombinationCelebration
  // for both the local player and opponents (everyone sees the same dice state).

  // Safety net: if every category is filled but the server status never flips
  // to 'finished' (missed realtime event, failed RPC), the player would be
  // stuck on a dead board — also after an app restart, where gameOver is
  // derived from the server status. So we detect completion from the scoreboard
  // itself and treat the match as finished after a short grace period.
  const boardComplete = !!gameState && gameState.players.length > 0 &&
    gameState.players.every(p =>
      CATEGORIES.every(cat => {
        const v = (p.scores as Record<string, number | null | undefined>)[cat.id];
        return v !== undefined && v !== null;
      })
    );
  const [finishFallback, setFinishFallback] = useState(false);
  useEffect(() => {
    if (status === 'finished') return;
    if (!boardComplete) return;
    const timer = setTimeout(() => setFinishFallback(true), 4000);
    return () => clearTimeout(timer);
  }, [status, boardComplete]);

  const navigatedToResultsRef = useRef(false);
  useEffect(() => {
    const matchDone = status === 'finished' || (finishFallback && boardComplete);

    if (matchDone && gameState && !navigatedToResultsRef.current) {
      navigatedToResultsRef.current = true;

      // M7: persist across remounts so navigating back to a finished match
      // (or hot reloads in dev) doesn't double-record local stats / friend
      // match rows. Server-side UPSERT (UNIQUE game_id) already dedupes
      // friend_match_results, but local recordGameResult does not.
      // IMPORTANT: this guard must only skip *stats recording* — navigation to
      // /results has to happen every time, otherwise re-entering a finished
      // match leaves the player stuck on the board.
      // Must survive app restarts (sessionStorage is wiped on relaunch, which
      // caused finished matches to be counted again after a crash/restart).
      const persistKey = gameId ? `stats-recorded:${gameId}` : null;
      let alreadyRecorded = statsRecordedRef.current;
      try {
        if (persistKey && (localStorage.getItem(persistKey) === '1' || sessionStorage.getItem(persistKey) === '1')) {
          alreadyRecorded = true;
        }
      } catch { /* storage unavailable — fall through */ }
      statsRecordedRef.current = true;
      try { if (persistKey) localStorage.setItem(persistKey, '1'); } catch { /* noop */ }


      const results = gameState.players.map(p => ({
        name: p.name,
        score: getTotalScore(p.scores),
        scores: p.scores,
      }));

      // System markers are not a player giving up — they mean the match was
      // closed automatically (timeout / cancelled lobby).
      const SYSTEM_END_MARKERS = ['Tidsgräns', 'Avbrutet', 'Ej accepterad'];
      const isSystemEnd = !!gameState.forfeitedBy && SYSTEM_END_MARKERS.includes(gameState.forfeitedBy);
      const isForfeit = !!gameState.forfeitedBy || !!gameState.forfeitedBySessionId;

      if (!alreadyRecorded && myPlayerIndex !== null && myPlayerIndex >= 0) {
        const me = gameState.players[myPlayerIndex];
        const myScore = results[myPlayerIndex]?.score ?? 0;
        const yatzys = (me?.scores as Record<string, number | null | undefined>)?.yatzy === 50 ? 1 : 0;

        if (isForfeit) {
          // A forfeited match is never counted in the statistics — neither as a
          // loss for the player who left nor as a win for the other one.
          trackEvent('game_finished', { won: false, draw: false, score: myScore, forfeit: true }, { gameId: gameId ?? undefined, gameMode: 'multiplayer' });
        } else {
          const topScore = Math.max(...results.map(r => r.score));
          const winnersAtTop = results.filter(r => r.score === topScore && topScore > 0).length;
          // A tie at the top is a draw — must NOT be counted as a win for
          // either player (server records winner_id = NULL in the same case).
          const isDraw = winnersAtTop > 1;
          const won = !isDraw && myScore === topScore && myScore > 0;
          recordGameResult(myScore, won, yatzys, gameId ? `mp:${gameId}` : undefined);
          trackEvent('game_finished', { won, draw: isDraw, score: myScore, forfeit: false }, { gameId: gameId ?? undefined, gameMode: 'multiplayer' });
        }


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
                if (gameState.forfeitedBySessionId) {
                  winnerId = gameState.forfeitedBySessionId === id1 ? id2
                    : gameState.forfeitedBySessionId === id2 ? id1 : null;
                } else {
                  winnerId = p1.name === gameState.forfeitedBy ? id2
                    : p2.name === gameState.forfeitedBy ? id1 : null;
                }
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

      if (gameId) removeActiveGame(gameId);

      // Pass opponent info for rematch button (only true 1v1 multiplayer).
      // The lookup is best-effort and time-boxed: if the network stalls we still
      // navigate to /results instead of leaving the player on a dead board.
      (async () => {
        let rematchOpponent: { sessionId: string; name: string } | undefined;
        if (myPlayerIndex !== null && gameState.players.length === 2 && gameId) {
          try {
            const lookup = supabase
              .from('game_players')
              .select('player_index, session_id, player_name')
              .eq('game_id', gameId);
            const res = await Promise.race([
              lookup,
              new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
            ]);
            const rows = (res as { data?: any[] } | null)?.data;
            const oppRow = (rows ?? []).find((r: any) => r.player_index !== myPlayerIndex);
            if (oppRow?.session_id && oppRow?.player_name) {
              rematchOpponent = { sessionId: oppRow.session_id, name: oppRow.player_name };
            }
          } catch { /* ignore — rematch button just won't appear */ }
        }
        navigate('/results', {
          state: {
            results,
            isMultiplayer: true,
            rematchOpponent,
            gameId,
            ...(isForfeit
              ? isSystemEnd
                ? { forfeit: true, timedOut: true }
                : { forfeit: true, forfeitPlayerName: gameState.forfeitedBy }
              : {}),
          },
          replace: true,
        });
      })();



    }
  }, [status, gameState, myPlayerIndex, navigate, finishFallback]);

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
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">{t('loadingGame')}</p>
          {/* Always offer an exit so a stalled load can never trap the player. */}
          <button
            onClick={() => navigate('/')}
            className="px-5 py-2.5 rounded-2xl bg-secondary text-secondary-foreground font-semibold text-sm"
          >
            {t('backToMenu')}
          </button>
        </div>
      </div>

    );
  }

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const possibleScores = !localRolling && !remoteRolling ? getPossibleScores() : null;
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
    // Heavy "thud" when the dice settle (synced with 1500ms dice animation)
    setTimeout(() => { playDiceLandHaptic().catch(() => {}); }, 1500);
  };

  const handleSelectCategory = (categoryId: string) => {
    if (!isMyTurn) return;
    if (categoryId === 'yatzy') {
      const allSame = gameState.dice.every(d => d === gameState.dice[0]);
      if (allSame) {
        // Celebration shown when dice landed; just analytics + haptic here.
        trackEvent('yatzy_scored', undefined, { gameId: gameId ?? undefined, gameMode: 'multiplayer' });
        playSuccessHaptic().catch(() => {});
      } else {
        playLightHaptic().catch(() => {});
      }
    } else {
      playLightHaptic().catch(() => {});
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
      className="ios-game-layout app-fixed-screen flex items-start justify-center overflow-hidden overscroll-none"
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
      <TurnTransition
        trigger={showTurnTransition}
        onDismiss={() => setShowTurnTransition(false)}
      />
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
                aiChosenCategory={pendingCategory}
                aiChosenPlayerIndex={pendingPlayerIndex}
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
                    } ${isMe && glowActive ? 'animate-pulse-gold' : ''} transition-all flex items-center justify-center`}>
                      {showAvatar ? (
                        <img src={avatarUrl!} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[8px] font-black text-white/90 leading-none">{label}</span>
                      )}
                    </div>
                    <span className={`text-[12px] font-semibold truncate max-w-[64px] ${
                      isCurrent ? 'text-foreground' : 'text-muted-foreground/50'
                    }`}>
                      {player.name}{isMe ? t('youSuffix') : ''}
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
            <div className="relative mt-2">
              <DiceArea
                dice={gameState.dice}
                lockedDice={gameState.lockedDice}
                rollsLeft={gameState.rollsLeft}
                isRolling={localRolling || remoteRolling || (!isMyTurn && gameState.isRolling)}
                onToggleLock={isMyTurn ? (i: number) => { playLightHaptic().catch(() => {}); toggleLock(i); } : () => {}}
                compact
                className="mt-0"
              />
            </div>

            {/* Quick Chat */}
            {gameId && (
              <div className="flex justify-center mt-2">
                <QuickChat
                  gameId={gameId}
                  myPlayerIndex={myPlayerIndex}
                  myName={(myPlayerIndex !== null ? gameState.players[myPlayerIndex]?.name : null) || getProfileName() || 'Du'}
                  inline
                />
              </div>
            )}

            {/* Bottom: Roll + Home + Forfeit */}
            <div
              className="ios-action-zone flex flex-col items-center gap-2"
              style={{ isolation: 'isolate', marginTop: '8px' }}
            >
              {/* Glow wrapper around kasta button when turn just changed to me */}
              <div className={`relative rounded-full ${glowActive && isMyTurn ? 'animate-pulse-gold' : ''}`}>
                {gameState.rollsLeft === 3 && isMyTurn && !(localRolling || remoteRolling || gameState.isRolling) && (
                  <TurnIndicator
                    currentPlayerName={currentPlayer.name}
                    isMyTurn={true}
                    rollsLeft={gameState.rollsLeft}
                    isRolling={false}
                    playerIndex={gameState.currentPlayerIndex}
                    placement="left"
                  />
                )}
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
                    // Use localRolling as the single source of truth on my turn —
                    // server is_rolling can lag/pulse and would block taps incorrectly.
                    if (canRoll && !localRolling) handleRoll();
                  }}
                  onPointerCancel={() => { pressedButtonRef.current = null; }}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  disabled={!canRoll || localRolling}
                  className={`relative w-[88px] h-[88px] rounded-full font-display font-bold text-[16px] tracking-wide transition-colors duration-200 flex items-center justify-center active:scale-[0.94] ${
                    canRoll && !localRolling
                      ? 'bg-gradient-to-b from-primary to-game-gold-dark text-primary-foreground shadow-[0_8px_32px_-4px_hsl(42_88%_52%/0.45),0_4px_16px_-2px_hsl(0_0%_0%/0.45)] kasta-pulse'
                      : 'bg-secondary text-muted-foreground shadow-none'
                  }`}
                  style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation', zIndex: 1 }}
                >
                  <span className="pointer-events-none text-center leading-tight px-1">
                  {!isMyTurn
                    ? '⏳'
                    : gameState.rollsLeft === 0
                      ? t('rollNoMore')
                      : gameState.rollsLeft === 3
                        ? t('roll1')
                        : gameState.rollsLeft === 2
                          ? t('roll2')
                          : t('rollLast')}
                  </span>
                </button>
              </div>

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

            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
