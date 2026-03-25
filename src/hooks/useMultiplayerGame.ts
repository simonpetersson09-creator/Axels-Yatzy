import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getSessionId } from '@/lib/session';
import { generateGameCode } from '@/lib/game-code';
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
  const sessionId = getSessionId();

  // Subscribe to realtime changes
  const subscribeToGame = useCallback((gameId: string) => {
    // Cleanup previous
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel(`game-${gameId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, () => {
        refreshGameState(gameId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_players', filter: `game_id=eq.${gameId}` }, () => {
        refreshGameState(gameId);
      })
      .subscribe();

    channelRef.current = channel;
  }, []);

  const refreshGameState = useCallback(async (gameId: string) => {
    const [gameRes, playersRes] = await Promise.all([
      supabase.from('games').select('*').eq('id', gameId).single(),
      supabase.from('game_players').select('*').eq('game_id', gameId).order('player_index'),
    ]);

    if (gameRes.error || playersRes.error) return;

    const game = gameRes.data;
    const dbPlayers = playersRes.data;

    const players: Player[] = dbPlayers.map(p => ({
      id: p.id,
      name: p.player_name,
      scores: (p.scores as Record<string, number | null>) ?? {},
    }));

    const myIndex = dbPlayers.findIndex(p => p.session_id === sessionId);
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
      myPlayerIndex: myIndex >= 0 ? myIndex : prev.myPlayerIndex,
      gameState,
      loading: false,
      error: null,
    }));
  }, [sessionId]);

  // Create a new game
  const createGame = useCallback(async (playerName: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    const gameCode = generateGameCode();

    const { data: game, error: gameErr } = await supabase
      .from('games')
      .insert({ game_code: gameCode })
      .select()
      .single();

    if (gameErr || !game) {
      setState(prev => ({ ...prev, loading: false, error: 'Kunde inte skapa spel' }));
      return null;
    }

    const { error: playerErr } = await supabase
      .from('game_players')
      .insert({
        game_id: game.id,
        player_name: playerName,
        player_index: 0,
        session_id: sessionId,
      });

    if (playerErr) {
      setState(prev => ({ ...prev, loading: false, error: 'Kunde inte gå med i spelet' }));
      return null;
    }

    subscribeToGame(game.id);
    await refreshGameState(game.id);
    return gameCode;
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

    subscribeToGame(result.game_id!);
    await refreshGameState(result.game_id!);
    return true;
  }, [sessionId, subscribeToGame, refreshGameState]);

  // Start the game (host only)
  const startGame = useCallback(async () => {
    if (!state.gameId || state.myPlayerIndex !== 0) return;

    await supabase
      .from('games')
      .update({ status: 'playing' as const })
      .eq('id', state.gameId);
  }, [state.gameId, state.myPlayerIndex]);

  // Roll dice — calls server-side Edge Function
  // is_rolling is handled as local animation state only
  const [localRolling, setLocalRolling] = useState(false);

  const roll = useCallback(async () => {
    if (!state.gameId || !state.gameState || localRolling) return;
    const gs = state.gameState;
    if (gs.rollsLeft <= 0) return;
    if (state.myPlayerIndex !== gs.currentPlayerIndex) return;

    // Start local animation
    setLocalRolling(true);

    const { error } = await supabase.functions.invoke('roll-dice', {
      body: { game_id: state.gameId, session_id: sessionId },
    });

    if (error) {
      console.error('Roll dice error:', error);
    }

    // End animation after delay (purely visual, not state-critical)
    setTimeout(() => setLocalRolling(false), 600);
  }, [state.gameId, state.gameState, state.myPlayerIndex, sessionId, localRolling]);

  // Toggle lock
  const toggleLock = useCallback(async (index: number) => {
    if (!state.gameId || !state.gameState) return;
    const gs = state.gameState;
    if (gs.rollsLeft === 3 || state.myPlayerIndex !== gs.currentPlayerIndex) return;

    const newLocked = [...gs.lockedDice];
    newLocked[index] = !newLocked[index];

    await supabase
      .from('games')
      .update({ locked_dice: newLocked })
      .eq('id', state.gameId);
  }, [state.gameId, state.gameState, state.myPlayerIndex]);

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
    if (!state.gameId || !state.gameState) return;
    const gs = state.gameState;
    if (gs.rollsLeft === 3 || state.myPlayerIndex !== gs.currentPlayerIndex) return;

    const currentPlayer = gs.players[gs.currentPlayerIndex];
    if (currentPlayer.scores[categoryId] !== undefined && currentPlayer.scores[categoryId] !== null) return;

    const { data, error } = await supabase.functions.invoke('submit-score', {
      body: { game_id: state.gameId, session_id: sessionId, category_id: categoryId },
    });

    if (error) {
      console.error('Submit score error:', error);
    }
  }, [state.gameId, state.gameState, state.myPlayerIndex, sessionId]);

  // Rejoin existing game — validates membership server-side first
  const rejoinGame = useCallback(async (gameId: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    // Validate session membership via secure RPC
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

    // Only subscribe and load state after validation passes
    subscribeToGame(gameId);
    await refreshGameState(gameId);
  }, [sessionId, subscribeToGame, refreshGameState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, []);

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
    rejoinGame,
  };
}
