import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getSessionId } from '@/lib/session';
import { generateGameCode } from '@/lib/game-code';
import { CategoryId, CATEGORIES, Player, GameState } from '@/types/yatzy';
import { calculateScore, rollDice } from '@/lib/yatzy-scoring';
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

    const { data: game, error: gameErr } = await supabase
      .from('games')
      .select('*')
      .eq('game_code', code.toUpperCase())
      .single();

    if (gameErr || !game) {
      setState(prev => ({ ...prev, loading: false, error: 'Spelet hittades inte' }));
      return false;
    }

    if (game.status !== 'waiting') {
      setState(prev => ({ ...prev, loading: false, error: 'Spelet har redan startat' }));
      return false;
    }

    // Check if already in the game
    const { data: existing } = await supabase
      .from('game_players')
      .select('*')
      .eq('game_id', game.id)
      .eq('session_id', sessionId);

    if (existing && existing.length > 0) {
      subscribeToGame(game.id);
      await refreshGameState(game.id);
      return true;
    }

    // Count current players
    const { count } = await supabase
      .from('game_players')
      .select('*', { count: 'exact', head: true })
      .eq('game_id', game.id);

    if ((count ?? 0) >= game.max_players) {
      setState(prev => ({ ...prev, loading: false, error: 'Spelet är fullt' }));
      return false;
    }

    const { error: playerErr } = await supabase
      .from('game_players')
      .insert({
        game_id: game.id,
        player_name: playerName,
        player_index: count ?? 0,
        session_id: sessionId,
      });

    if (playerErr) {
      setState(prev => ({ ...prev, loading: false, error: 'Kunde inte gå med' }));
      return false;
    }

    subscribeToGame(game.id);
    await refreshGameState(game.id);
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

  // Roll dice
  const roll = useCallback(async () => {
    if (!state.gameId || !state.gameState) return;
    const gs = state.gameState;
    if (gs.rollsLeft <= 0 || gs.isRolling) return;
    if (state.myPlayerIndex !== gs.currentPlayerIndex) return;

    const locked = gs.rollsLeft === 3 ? [false, false, false, false, false] : gs.lockedDice;
    const newDice = rollDice(gs.dice, locked);

    await supabase
      .from('games')
      .update({
        dice: newDice,
        rolls_left: gs.rollsLeft - 1,
        is_rolling: true,
        locked_dice: gs.rollsLeft === 3 ? [false, false, false, false, false] : gs.lockedDice,
      })
      .eq('id', state.gameId);

    setTimeout(async () => {
      await supabase
        .from('games')
        .update({ is_rolling: false })
        .eq('id', state.gameId);
    }, 600);
  }, [state.gameId, state.gameState, state.myPlayerIndex]);

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

  // Select category
  const selectCategory = useCallback(async (categoryId: CategoryId) => {
    if (!state.gameId || !state.gameState) return;
    const gs = state.gameState;
    if (gs.rollsLeft === 3 || state.myPlayerIndex !== gs.currentPlayerIndex) return;

    const currentPlayer = gs.players[gs.currentPlayerIndex];
    if (currentPlayer.scores[categoryId] !== undefined && currentPlayer.scores[categoryId] !== null) return;

    const score = calculateScore(gs.dice, categoryId);
    const newScores = { ...currentPlayer.scores, [categoryId]: score };

    // Update player scores
    await supabase
      .from('game_players')
      .update({ scores: newScores })
      .eq('id', currentPlayer.id);

    // Check if game is over
    const allFilled = CATEGORIES.every(cat => newScores[cat.id] !== undefined && newScores[cat.id] !== null);

    let nextPlayerIndex = (gs.currentPlayerIndex + 1) % gs.players.length;
    let gameOver = false;

    if (allFilled && nextPlayerIndex <= gs.currentPlayerIndex) {
      // Check all players
      const allDone = gs.players.every((p, i) => {
        const scores = i === gs.currentPlayerIndex ? newScores : p.scores;
        return CATEGORIES.every(cat => scores[cat.id] !== undefined && scores[cat.id] !== null);
      });
      if (allDone) gameOver = true;
    }

    await supabase
      .from('games')
      .update({
        current_player_index: gameOver ? gs.currentPlayerIndex : nextPlayerIndex,
        dice: [1, 1, 1, 1, 1],
        locked_dice: [false, false, false, false, false],
        rolls_left: 3,
        is_rolling: false,
        status: gameOver ? 'finished' as 'finished' : 'playing' as 'playing',
        round: nextPlayerIndex === 0 ? gs.round + 1 : gs.round,
      })
      .eq('id', state.gameId);
  }, [state.gameId, state.gameState, state.myPlayerIndex]);

  // Rejoin existing game
  const rejoinGame = useCallback(async (gameId: string) => {
    setState(prev => ({ ...prev, loading: true }));
    subscribeToGame(gameId);
    await refreshGameState(gameId);
  }, [subscribeToGame, refreshGameState]);

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
