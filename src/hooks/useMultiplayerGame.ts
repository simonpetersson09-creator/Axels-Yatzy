import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getSessionId } from '@/lib/session';
import { CategoryId, CATEGORIES, Player, GameState } from '@/types/yatzy';
import { calculateScore } from '@/lib/yatzy-scoring';
import type { RealtimeChannel } from '@supabase/supabase-js';

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
  const mountedRef = useRef(true);
  const sessionId = getSessionId();
  // Use ref to avoid stale closure in debouncedRefresh
  const refreshGameStateRef = useRef<((gameId: string) => Promise<void>) | null>(null);

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

    const gameState: GameState = {
      players,
      currentPlayerIndex: game.current_player_index,
      dice: game.dice as number[],
      lockedDice: game.locked_dice as boolean[],
      rollsLeft: game.rolls_left,
      isRolling: game.is_rolling,
      gameOver: gameStatus === 'finished',
      round: game.round,
    };

    setState(prev => ({
      ...prev,
      gameId: game.id,
      gameCode: game.game_code,
      status: gameStatus,
      // myPlayerIndex is set by createGame/joinGame/rejoinGame, not here
      gameState,
      loading: false,
      error: null,
    }));
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
  }, [cleanupChannel, debouncedRefresh, startPresence]);

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

    const result = data as { success: boolean; error?: string; game_id?: string; game_code?: string };

    if (!result.success) {
      setState(prev => ({ ...prev, loading: false, error: result.error || 'Kunde inte skapa spel' }));
      return null;
    }

    // C3 fix: creator is always player index 0
    setState(prev => ({ ...prev, myPlayerIndex: 0 }));
    subscribeToGame(result.game_id!);
    await refreshGameState(result.game_id!);
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
    }
  }, [state.gameId, state.myPlayerIndex, sessionId]);

  // Roll dice — calls server-side Edge Function
  const [localRolling, setLocalRolling] = useState(false);

  const roll = useCallback(async () => {
    if (!state.gameId || !state.gameState || localRolling) return;
    const gs = state.gameState;
    if (gs.rollsLeft <= 0) return;
    if (state.myPlayerIndex !== gs.currentPlayerIndex) return;

    setLocalRolling(true);

    // Send heartbeat on action
    supabase.rpc('heartbeat', { p_game_id: state.gameId, p_session_id: sessionId }).then();

    const { error } = await supabase.functions.invoke('roll-dice', {
      body: { game_id: state.gameId, session_id: sessionId },
    });

    if (error) {
      console.error('Roll dice error:', error);
    }

    // BUG 11 fix: clear previous timer and guard against unmounted update
    if (rollingTimerRef.current) clearTimeout(rollingTimerRef.current);
    rollingTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setLocalRolling(false);
    }, 600);
  }, [state.gameId, state.gameState, state.myPlayerIndex, sessionId, localRolling]);

  // Toggle lock — server-side validated
  const toggleLock = useCallback(async (index: number) => {
    if (!state.gameId || !state.gameState || localRolling) return;
    const gs = state.gameState;
    if (gs.rollsLeft === 3 || state.myPlayerIndex !== gs.currentPlayerIndex) return;

    // Send heartbeat on action
    supabase.rpc('heartbeat', { p_game_id: state.gameId, p_session_id: sessionId }).then();

    const { error } = await supabase.functions.invoke('toggle-lock', {
      body: { game_id: state.gameId, session_id: sessionId, dice_index: index },
    });

    if (error) {
      console.error('Toggle lock error:', error);
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
  const selectCategory = useCallback(async (categoryId: CategoryId) => {
    if (!state.gameId || !state.gameState || localRolling) return;
    const gs = state.gameState;
    if (gs.rollsLeft === 3 || state.myPlayerIndex !== gs.currentPlayerIndex) return;

    const currentPlayer = gs.players[gs.currentPlayerIndex];
    if (currentPlayer.scores[categoryId] !== undefined && currentPlayer.scores[categoryId] !== null) return;

    // Send heartbeat on action
    supabase.rpc('heartbeat', { p_game_id: state.gameId, p_session_id: sessionId }).then();

    const { error } = await supabase.functions.invoke('submit-score', {
      body: { game_id: state.gameId, session_id: sessionId, category_id: categoryId },
    });

    if (error) {
      console.error('Submit score error:', error);
    }
  }, [state.gameId, state.gameState, state.myPlayerIndex, sessionId]);

  // Forfeit — calls server-side Edge Function
  const forfeitGame = useCallback(async () => {
    if (!state.gameId) return;

    const { error } = await supabase.functions.invoke('forfeit-game', {
      body: { game_id: state.gameId, session_id: sessionId },
    });

    if (error) {
      console.error('Forfeit error:', error);
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

    subscribeToGame(gameId);
    await refreshGameState(gameId);
  }, [sessionId, subscribeToGame, refreshGameState]);

  // Stop presence/polling when game is finished
  useEffect(() => {
    if (state.status === 'finished') {
      cleanupTimers();
    }
  }, [state.status, cleanupTimers]);

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
