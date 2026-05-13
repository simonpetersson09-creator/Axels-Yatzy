import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getSessionId } from '@/lib/session';
import { CategoryId, CATEGORIES, Player, GameState } from '@/types/yatzy';
const SUBMIT_ANIM_MS = 700;
import { calculateScore } from '@/lib/yatzy-scoring';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { trackEvent } from '@/lib/analytics';
import { pingTurnChange } from '@/lib/notifications';

interface MultiplayerState {
  gameId: string | null;
  gameCode: string | null;
  status: 'waiting' | 'playing' | 'finished';
  myPlayerIndex: number | null;
  gameState: GameState | null;
  error: string | null;
  loading: boolean;
}

const HEARTBEAT_INTERVAL_MS = 15_000;
const INACTIVE_TIMEOUT_S = 60;
const INACTIVE_CHECK_INTERVAL_MS = 10_000;
const NETWORK_TIMEOUT_MS = 15_000;

// Wrap a promise with a timeout. Rejects with Error('timeout') after ms.
function withTimeout<T>(promise: Promise<T>, ms = NETWORK_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

export function useMultiplayerGame() {
  const [state, setState] = useState<MultiplayerState>({
    gameId: null,
    gameCode: null,
    status: 'waiting',
    myPlayerIndex: null,
    gameState: null,
    error: null,
    loading: false,
  });

  const channelRef = useRef<RealtimeChannel | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inactiveCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteRollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittingRef = useRef(false);
  const mountedRef = useRef(true);
  const sessionId = getSessionId();
  // Use ref to avoid stale closure in debouncedRefresh
  const refreshGameStateRef = useRef<((gameId: string) => Promise<void>) | null>(null);
  // Buffer for server dice/roll fields received during a local roll animation.
  // Applied at end of ROLL_ANIM_MS so dice never change mid-spin.
  const pendingRollUpdateRef = useRef<{ dice: number[]; lockedDice: boolean[]; isRolling: boolean; rollsLeft: number } | null>(null);
  // Set while a score-submit RPC is in flight. While set, realtime/refresh
  // payloads are dropped so the optimistic UI (filled cell, advanced turn,
  // reset dice) isn't briefly overwritten by a stale server snapshot.
  const pendingSubmitRef = useRef<{ key: string; gameId: string } | null>(null);

  // Client-driven dice spin for the *opponent* — server.is_rolling stays false,
  // so we synthesize a rolling pulse when realtime delivers fresh dice for the
  // other player. Synced with Dice ANIM_DURATION (~1100 ms).
  const ROLL_ANIM_MS = 1100;
  const [localRolling, setLocalRolling] = useState(false);
  const [remoteRolling, setRemoteRolling] = useState(false);
  const rollingGuardRef = useRef(false);
  const remoteRollingGuardRef = useRef(false);
  // Pending category surfaces an `aiChosenCategory`-style highlight while the
  // submit RPC is in flight. Cleared in the same SUBMIT_ANIM_MS window as
  // pendingSubmitRef.
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);

  // Cleanup any existing channel
  const cleanupChannel = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  const cleanupTimers = useCallback(() => {
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
    if (inactiveCheckRef.current) { clearInterval(inactiveCheckRef.current); inactiveCheckRef.current = null; }
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
  }, []);

  const refreshGameState = useCallback(async (gameId: string) => {
    const [gameRes, playersRes] = await Promise.all([
      supabase.from('games').select('*').eq('id', gameId).single(),
      supabase.from('game_players').select('id, game_id, player_name, player_index, scores').eq('game_id', gameId).order('player_index'),
    ]);

    if (gameRes.error || playersRes.error) return;

    const game = gameRes.data;
    const dbPlayers = playersRes.data;

    const players: Player[] = dbPlayers.map(p => ({
      id: p.id,
      name: p.player_name,
      scores: (p.scores as Record<string, number | null>) ?? {},
    }));

    // Use stored myPlayerIndex instead of matching on session_id
    const gameStatus = game.status as 'waiting' | 'playing' | 'finished';

    const dicePart = {
      dice: game.dice as number[],
      lockedDice: game.locked_dice as boolean[],
      rollsLeft: game.rolls_left,
      isRolling: game.is_rolling,
    };

    const restPart = {
      players,
      currentPlayerIndex: game.current_player_index,
      gameOver: gameStatus === 'finished',
      round: game.round,
      forfeitedBy: game.forfeited_by ?? null,
    };

    // If a local roll animation is in flight, buffer the new dice/roll fields.
    // They will be flushed at the end of ROLL_ANIM_MS so the spin animation
    // never sees its target value change mid-flight.
    if (rollingGuardRef.current || remoteRollingGuardRef.current) {
      pendingRollUpdateRef.current = dicePart;
      setState(prev => ({
        ...prev,
        gameId: game.id,
        gameCode: game.game_code,
        status: gameStatus,
        gameState: prev.gameState
          ? { ...prev.gameState, ...restPart }
          : { ...dicePart, ...restPart },
        loading: false,
        error: null,
      }));
      return;
    }

    // While a score submit is in flight we keep the optimistic state intact.
    // The RPC resolution path will trigger a fresh refresh once it completes.
    if (pendingSubmitRef.current) {
      setState(prev => ({
        ...prev,
        gameId: game.id,
        gameCode: game.game_code,
        status: gameStatus,
        loading: false,
        error: null,
      }));
      return;
    }

    const gameStateNext: GameState = { ...dicePart, ...restPart };

    setState(prev => {
      const prevGS = prev.gameState;
      const myIdx = prev.myPlayerIndex;
      const isMyTurnNow = myIdx !== null && myIdx === restPart.currentPlayerIndex;

      // Detect an OPPONENT roll: rolls_left dropped while still their turn.
      // Synthesize a client-side rolling pulse and buffer the new dice values
      // so they only resolve at the end of the spin.
      const opponentRolled =
        prevGS &&
        !rollingGuardRef.current &&
        !isMyTurnNow &&
        restPart.currentPlayerIndex === prevGS.currentPlayerIndex &&
        restPart.round === prevGS.round &&
        dicePart.rollsLeft < prevGS.rollsLeft;

      if (opponentRolled) {
        pendingRollUpdateRef.current = dicePart;
        remoteRollingGuardRef.current = true;
        setRemoteRolling(true);
        if (remoteRollingTimerRef.current) clearTimeout(remoteRollingTimerRef.current);
        remoteRollingTimerRef.current = setTimeout(() => {
          if (!mountedRef.current) return;
          flushPendingRoll();
          remoteRollingGuardRef.current = false;
          setRemoteRolling(false);
        }, ROLL_ANIM_MS);

        return {
          ...prev,
          gameId: game.id,
          gameCode: game.game_code,
          status: gameStatus,
          gameState: { ...prevGS, ...restPart },
          loading: false,
          error: null,
        };
      }

      return {
        ...prev,
        gameId: game.id,
        gameCode: game.game_code,
        status: gameStatus,
        gameState: gameStateNext,
        loading: false,
        error: null,
      };
    });
  }, []);

  // Keep ref in sync so debouncedRefresh always calls latest version
  useEffect(() => {
    refreshGameStateRef.current = refreshGameState;
  }, [refreshGameState]);

  // Debounced refresh — uses ref to avoid stale closure (BUG 10 fix)
  const debouncedRefresh = useCallback((gameId: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      refreshGameStateRef.current?.(gameId);
    }, 100);
  }, []);

  // Start heartbeat (all players) — inactive polling is managed separately
  const startPresence = useCallback((gameId: string) => {
    // Heartbeat: update last_active_at every 15s
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    // Send immediately
    supabase.rpc('heartbeat', { p_game_id: gameId, p_session_id: sessionId }).then();
    heartbeatRef.current = setInterval(() => {
      supabase.rpc('heartbeat', { p_game_id: gameId, p_session_id: sessionId }).then();
    }, HEARTBEAT_INTERVAL_MS);
  }, [sessionId]);

  // Only the "next player" after the current player polls skip_inactive_turn.
  // This reduces N× polling to exactly 1×. If the designated poller disconnects,
  // they become inactive → get skipped → a new next-player takes over. Self-healing.
  useEffect(() => {
    if (inactiveCheckRef.current) { clearInterval(inactiveCheckRef.current); inactiveCheckRef.current = null; }

    const gs = state.gameState;
    const gameId = state.gameId;
    if (!gs || !gameId || state.status !== 'playing' || state.myPlayerIndex === null) return;

    const playerCount = gs.players.length;
    if (playerCount < 2) return;

    const nextPlayerIndex = (gs.currentPlayerIndex + 1) % playerCount;
    const iAmDesignatedPoller = state.myPlayerIndex === nextPlayerIndex;

    if (!iAmDesignatedPoller) return;

    inactiveCheckRef.current = setInterval(async () => {
      await supabase.rpc('skip_inactive_turn', {
        p_game_id: gameId,
        p_timeout_seconds: INACTIVE_TIMEOUT_S,
      });
    }, INACTIVE_CHECK_INTERVAL_MS);

    return () => {
      if (inactiveCheckRef.current) { clearInterval(inactiveCheckRef.current); inactiveCheckRef.current = null; }
    };
  }, [state.gameId, state.status, state.myPlayerIndex, state.gameState?.currentPlayerIndex, state.gameState?.players.length]);

  // Subscribe to realtime changes (single channel for both lobby + game)
  const subscribeToGame = useCallback((gameId: string) => {
    cleanupChannel();
    cleanupTimers();

    const channel = supabase
      .channel(`yatzy-${gameId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, () => {
        debouncedRefresh(gameId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_players', filter: `game_id=eq.${gameId}` }, () => {
        debouncedRefresh(gameId);
      })
      .subscribe();

    channelRef.current = channel;
    startPresence(gameId);
  }, [cleanupChannel, cleanupTimers, debouncedRefresh, startPresence]);

  // Create a new game via atomic RPC
  const createGame = useCallback(async (playerName: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    const { data, error: rpcErr } = await supabase.rpc('create_game_with_code', {
      p_player_name: playerName,
      p_session_id: sessionId,
    });

    if (rpcErr || !data) {
      setState(prev => ({ ...prev, loading: false, error: 'Kunde inte skapa spel' }));
      return null;
    }

    const result = data as { success: boolean; error?: string; game_id?: string; game_code?: string; player_index?: number };

    if (!result.success) {
      setState(prev => ({ ...prev, loading: false, error: result.error || 'Kunde inte skapa spel' }));
      return null;
    }

    // Use player_index from RPC (defaults to 0 for creator)
    setState(prev => ({ ...prev, myPlayerIndex: result.player_index ?? 0 }));
    subscribeToGame(result.game_id!);
    await refreshGameState(result.game_id!);
    trackEvent('multiplayer_room_created', { code: result.game_code }, { gameId: result.game_id, gameMode: 'multiplayer' });
    return result.game_code!;
  }, [sessionId, subscribeToGame, refreshGameState]);

  // Join existing game
  const joinGame = useCallback(async (code: string, playerName: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    const { data, error: rpcErr } = await supabase.rpc('join_game', {
      p_game_code: code.toUpperCase(),
      p_player_name: playerName,
      p_session_id: sessionId,
    });

    if (rpcErr || !data) {
      setState(prev => ({ ...prev, loading: false, error: 'Kunde inte gå med i spelet' }));
      return false;
    }

    const result = data as { success: boolean; error?: string; game_id?: string; game_code?: string };

    if (!result.success) {
      setState(prev => ({ ...prev, loading: false, error: result.error || 'Kunde inte gå med' }));
      return false;
    }

    // C3 fix: set myPlayerIndex from join result
    const playerIndex = (result as any).player_index ?? null;
    setState(prev => ({ ...prev, myPlayerIndex: playerIndex }));
    subscribeToGame(result.game_id!);
    await refreshGameState(result.game_id!);
    trackEvent('multiplayer_room_joined', { code: result.game_code }, { gameId: result.game_id, gameMode: 'multiplayer' });
    return true;
  }, [sessionId, subscribeToGame, refreshGameState]);

  // Start the game (host only) — server-side validated
  const startGame = useCallback(async () => {
    if (!state.gameId || state.myPlayerIndex !== 0) return;

    const { data, error } = await supabase.functions.invoke('start-game', {
      body: { game_id: state.gameId, session_id: sessionId },
    });

    if (error) {
      console.error('Start game error:', error);
      const msg = data?.error || 'Kunde inte starta spelet';
      setState(prev => ({ ...prev, error: msg }));
    } else {
      trackEvent('game_started', undefined, { gameId: state.gameId, gameMode: 'multiplayer' });
    }
  }, [state.gameId, state.myPlayerIndex, sessionId]);

  // Roll dice — calls server-side Edge Function. Animation timing is client-driven
  // and synced with Dice ANIM_DURATION (~1050 ms) so the rolling=false→true→false
  // pulse is clean and dice values never change mid-spin.
  // (ROLL_ANIM_MS / localRolling / rollingGuardRef are declared near the top.)

  const flushPendingRoll = useCallback(() => {
    const buffered = pendingRollUpdateRef.current;
    pendingRollUpdateRef.current = null;
    if (!buffered) return;
    setState(prev => prev.gameState ? {
      ...prev,
      gameState: { ...prev.gameState, ...buffered },
    } : prev);
  }, []);

  const roll = useCallback(async () => {
    if (rollingGuardRef.current) return;
    if (!state.gameId || !state.gameState) return;
    const gs = state.gameState;
    if (gs.rollsLeft <= 0) return;
    if (state.myPlayerIndex !== gs.currentPlayerIndex) return;

    rollingGuardRef.current = true;
    setLocalRolling(true);
    pendingRollUpdateRef.current = null;

    // Send heartbeat on action
    supabase.rpc('heartbeat', { p_game_id: state.gameId, p_session_id: sessionId }).then();

    // Fire RPC in parallel — we don't await it for the animation timing
    const rpcPromise = withTimeout(supabase.functions.invoke('roll-dice', {
      body: { game_id: state.gameId, session_id: sessionId },
    })).then(({ error }) => {
      if (error) console.error('Roll dice error:', error);
      return { ok: !error } as const;
    }).catch((err) => {
      console.error('Roll dice failed:', err);
      const msg = (err as Error)?.message === 'timeout'
        ? 'Anslutningen tog för lång tid. Försök igen.'
        : 'Kunde inte kasta tärningarna';
      if (mountedRef.current) setState(prev => ({ ...prev, error: msg }));
      return { ok: false } as const;
    });

    // Always wait the full animation duration before clearing localRolling.
    // Apply any buffered server dice values right at the end of the spin.
    if (rollingTimerRef.current) clearTimeout(rollingTimerRef.current);
    rollingTimerRef.current = setTimeout(async () => {
      // Make sure the server response has landed before flipping back, otherwise
      // we could clear localRolling before the new dice arrive.
      await rpcPromise;
      if (!mountedRef.current) return;
      flushPendingRoll();
      rollingGuardRef.current = false;
      setLocalRolling(false);
    }, ROLL_ANIM_MS);
  }, [state.gameId, state.gameState, state.myPlayerIndex, sessionId, flushPendingRoll]);

  // Toggle lock — optimistic local update, server validates in background.
  // Rolls back via refresh on RPC failure.
  const toggleLock = useCallback(async (index: number) => {
    if (!state.gameId || !state.gameState || rollingGuardRef.current) return;
    const gs = state.gameState;
    if (gs.rollsLeft === 3 || gs.rollsLeft === 0 || state.myPlayerIndex !== gs.currentPlayerIndex) return;

    const gameId = state.gameId;

    // Optimistic update — flip locally immediately so the lock animation triggers on tap.
    const optimisticLocks = [...gs.lockedDice];
    optimisticLocks[index] = !optimisticLocks[index];
    setState(prev => prev.gameState ? {
      ...prev,
      gameState: { ...prev.gameState, lockedDice: optimisticLocks },
    } : prev);

    // Send heartbeat on action
    supabase.rpc('heartbeat', { p_game_id: gameId, p_session_id: sessionId }).then();

    try {
      const { error } = await withTimeout(supabase.functions.invoke('toggle-lock', {
        body: { game_id: gameId, session_id: sessionId, dice_index: index },
      }));
      if (error) {
        console.error('Toggle lock error:', error);
        // Rollback by refreshing authoritative state
        refreshGameStateRef.current?.(gameId);
      }
    } catch (err) {
      console.error('Toggle lock failed:', err);
      refreshGameStateRef.current?.(gameId);
    }
  }, [state.gameId, state.gameState, state.myPlayerIndex, sessionId]);

  // Get possible scores
  const getPossibleScores = useCallback((): Record<CategoryId, number> | null => {
    if (!state.gameState || state.gameState.rollsLeft === 3) return null;
    const gs = state.gameState;
    const result: Record<string, number> = {};
    const currentPlayer = gs.players[gs.currentPlayerIndex];
    CATEGORIES.forEach(cat => {
      if (currentPlayer.scores[cat.id] === undefined || currentPlayer.scores[cat.id] === null) {
        result[cat.id] = calculateScore(gs.dice, cat.id);
      }
    });
    return result as Record<CategoryId, number>;
  }, [state.gameState]);

  // Select category — calls server-side Edge Function
  const selectCategory = useCallback(async (categoryId: CategoryId, debug?: { rowText?: string; clickedCategoryId?: CategoryId; renderedRowIndex?: number | null; score?: number | null }) => {
    if (submittingRef.current) return;
    if (!state.gameId || !state.gameState || rollingGuardRef.current) return;
    const gs = state.gameState;
    if (gs.rollsLeft === 3 || state.myPlayerIndex !== gs.currentPlayerIndex) return;

    const currentPlayer = gs.players[gs.currentPlayerIndex];
    if (currentPlayer.scores[categoryId] !== undefined && currentPlayer.scores[categoryId] !== null) return;

    console.log('scoreboard-category-saved', {
      clickedRowText: debug?.rowText ?? null,
      clickedCategoryId: debug?.clickedCategoryId ?? categoryId,
      renderedRowIndex: debug?.renderedRowIndex ?? null,
      actualSavedCategory: categoryId,
      currentPlayer: currentPlayer.name,
      score: debug?.score ?? null,
    });

    submittingRef.current = true;
    const gameId = state.gameId;

    // ── Optimistic UI ───────────────────────────────────────────────────────
    // Mirror useYatzyGame.selectCategory exactly so multiplayer feels as
    // responsive as Snabb match: fill the cell, advance the turn, reset dice
    // and rollsLeft locally — server is still authoritative and will either
    // confirm this state or trigger a rollback via refreshGameState.
    const optimisticScore = calculateScore(gs.dice, categoryId);
    const updatedPlayers = gs.players.map((p, i) => {
      if (i !== gs.currentPlayerIndex) return p;
      return { ...p, scores: { ...p.scores, [categoryId]: optimisticScore } };
    });
    const allDone = updatedPlayers.every(p =>
      CATEGORIES.every(cat => p.scores[cat.id] !== undefined && p.scores[cat.id] !== null)
    );
    let nextPlayerIndex = (gs.currentPlayerIndex + 1) % gs.players.length;
    if (!allDone) {
      for (let i = 0; i < gs.players.length; i++) {
        const candidate = (gs.currentPlayerIndex + 1 + i) % gs.players.length;
        const hasOpen = CATEGORIES.some(cat =>
          updatedPlayers[candidate].scores[cat.id] === undefined ||
          updatedPlayers[candidate].scores[cat.id] === null
        );
        if (hasOpen) { nextPlayerIndex = candidate; break; }
      }
    }

    pendingSubmitRef.current = { key: `${gs.currentPlayerIndex}:${categoryId}`, gameId };

    setState(prev => prev.gameState ? {
      ...prev,
      gameState: {
        ...prev.gameState,
        players: updatedPlayers,
        currentPlayerIndex: allDone ? prev.gameState.currentPlayerIndex : nextPlayerIndex,
        dice: [1, 1, 1, 1, 1],
        lockedDice: [false, false, false, false, false],
        rollsLeft: 3,
        isRolling: false,
        gameOver: allDone,
        round: nextPlayerIndex === 0 && !allDone ? prev.gameState.round + 1 : prev.gameState.round,
      },
    } : prev);

    // Send heartbeat on action
    supabase.rpc('heartbeat', { p_game_id: gameId, p_session_id: sessionId }).then();

    let rpcOk = true;
    try {
      const { error } = await withTimeout(supabase.functions.invoke('submit-score', {
        body: { game_id: gameId, session_id: sessionId, category_id: categoryId },
      }));
      if (error) {
        rpcOk = false;
        console.error('Submit score error:', error);
      }
    } catch (err) {
      rpcOk = false;
      console.error('Submit score failed:', err);
      const msg = (err as Error)?.message === 'timeout' ? 'Anslutningen tog för lång tid. Försök igen.' : 'Kunde inte spara poäng';
      if (mountedRef.current) setState(prev => ({ ...prev, error: msg }));
    } finally {
      // Hold the optimistic state through the cell-fill animation, then
      // reconcile with the authoritative server snapshot. On RPC failure
      // this acts as the rollback path.
      setTimeout(() => {
        pendingSubmitRef.current = null;
        submittingRef.current = false;
        if (!mountedRef.current) return;
        if (!rpcOk) {
          refreshGameStateRef.current?.(gameId);
        } else {
          // Pull authoritative state in case the realtime payload arrived
          // while we were holding it back.
          refreshGameStateRef.current?.(gameId);
        }
      }, SUBMIT_ANIM_MS);
    }
  }, [state.gameId, state.gameState, state.myPlayerIndex, sessionId]);

  // Forfeit — calls server-side Edge Function
  const forfeitGame = useCallback(async () => {
    if (!state.gameId) return;

    try {
      const { error } = await withTimeout(supabase.functions.invoke('forfeit-game', {
        body: { game_id: state.gameId, session_id: sessionId },
      }));
      if (error) {
        console.error('Forfeit error:', error);
        throw new Error('Forfeit failed');
      }
      trackEvent('game_forfeited', undefined, { gameId: state.gameId, gameMode: 'multiplayer' });
    } catch (err) {
      console.error('Forfeit failed:', err);
      throw err instanceof Error ? err : new Error('Forfeit failed');
    }
  }, [state.gameId, sessionId]);

  // Rejoin existing game — validates membership server-side first
  const rejoinGame = useCallback(async (gameId: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    const { data, error: rpcErr } = await supabase.rpc('validate_game_session', {
      p_game_id: gameId,
      p_session_id: sessionId,
    });

    if (rpcErr || !data) {
      setState(prev => ({ ...prev, loading: false, error: 'Kunde inte validera spelåtkomst' }));
      return;
    }

    const result = data as { valid: boolean; error?: string; player_index?: number };

    if (!result.valid) {
      setState(prev => ({ ...prev, loading: false, error: result.error || 'Åtkomst nekad' }));
      return;
    }

    // Set myPlayerIndex from validated result before subscribing
    setState(prev => ({ ...prev, myPlayerIndex: result.player_index ?? prev.myPlayerIndex }));

    try {
      subscribeToGame(gameId);
      await refreshGameState(gameId);
    } catch (err) {
      // H3 fix: cleanup on failure
      cleanupChannel();
      cleanupTimers();
      setState(prev => ({ ...prev, loading: false, error: 'Kunde inte återansluta till spelet' }));
    }
  }, [sessionId, subscribeToGame, refreshGameState, cleanupChannel, cleanupTimers]);

  // Stop presence/polling when game is finished
  useEffect(() => {
    if (state.status === 'finished') {
      cleanupTimers();
    }
  }, [state.status, cleanupTimers]);

  // Foreground reconnect (iOS Capacitor / Safari): re-subscribe + refresh + heartbeat
  // when the app comes back from background. Avoids dead realtime channels after suspend.
  useEffect(() => {
    const gameId = state.gameId;
    if (!gameId || state.status === 'finished') return;

    const handleForeground = () => {
      if (document.visibilityState !== 'visible') return;
      // Re-subscribe (cleanupChannel inside subscribeToGame avoids duplicates)
      subscribeToGame(gameId);
      // Pull latest state
      refreshGameStateRef.current?.(gameId);
      // Refresh presence
      supabase.rpc('heartbeat', { p_game_id: gameId, p_session_id: sessionId }).then();
    };

    document.addEventListener('visibilitychange', handleForeground);
    window.addEventListener('pageshow', handleForeground);
    window.addEventListener('focus', handleForeground);

    return () => {
      document.removeEventListener('visibilitychange', handleForeground);
      window.removeEventListener('pageshow', handleForeground);
      window.removeEventListener('focus', handleForeground);
    };
  }, [state.gameId, state.status, subscribeToGame, sessionId]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cleanupChannel();
      cleanupTimers();
      if (rollingTimerRef.current) clearTimeout(rollingTimerRef.current);
    };
  }, [cleanupChannel, cleanupTimers]);

  // Notify when turn ownership changes (server is the source of truth; client just pings)
  const lastNotifiedTurnRef = useRef<string | null>(null);
  useEffect(() => {
    const gameId = state.gameId;
    const gs = state.gameState;
    if (!gameId || !gs || state.status !== 'playing') return;
    const key = `${gameId}:${gs.round}:${gs.currentPlayerIndex}`;
    if (lastNotifiedTurnRef.current === key) return;
    lastNotifiedTurnRef.current = key;
    // Only ping when it's NOT my turn (so the server pings the actual recipient).
    // Skip when I'm the current player — server-side check handles edge cases anyway.
    void pingTurnChange(gameId);
  }, [state.gameId, state.status, state.gameState?.currentPlayerIndex, state.gameState?.round]);

  const isMyTurn = state.gameState ? state.myPlayerIndex === state.gameState.currentPlayerIndex : false;

  return {
    ...state,
    isMyTurn,
    localRolling,
    createGame,
    joinGame,
    startGame,
    roll,
    toggleLock,
    getPossibleScores,
    selectCategory,
    forfeitGame,
    rejoinGame,
  };
}
