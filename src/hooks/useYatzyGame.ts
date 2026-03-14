import { useState, useCallback, useEffect } from 'react';
import { GameState, Player, CategoryId, CATEGORIES } from '@/types/yatzy';
import { calculateScore, rollDice } from '@/lib/yatzy-scoring';
import { setActiveGame, updateLastRollTime, saveGameState, loadGameState, clearActiveGame } from '@/lib/active-game';

function createPlayer(name: string, index: number): Player {
  return {
    id: `player-${index}`,
    name,
    scores: {},
  };
}

export function useYatzyGame() {
  const [gameState, setGameState] = useState<GameState | null>(() => {
    // Try to restore saved game on mount
    return loadGameState<GameState>();
  });

  // Persist game state on every change
  useEffect(() => {
    if (gameState && !gameState.gameOver) {
      saveGameState(gameState);
      setActiveGame({ type: 'local', timestamp: Date.now() });
    }
  }, [gameState]);

  const startGame = useCallback((playerNames: string[]) => {
    const players = playerNames.map((name, i) => createPlayer(name, i));
    const state: GameState = {
      players,
      currentPlayerIndex: 0,
      dice: [1, 1, 1, 1, 1],
      lockedDice: [false, false, false, false, false],
      rollsLeft: 3,
      isRolling: false,
      gameOver: false,
      round: 1,
    };
    setGameState(state);
  }, []);

  const roll = useCallback(() => {
    setGameState(prev => {
      if (!prev || prev.rollsLeft <= 0 || prev.isRolling) return prev;
      const newDice = rollDice(prev.dice, prev.rollsLeft === 3 ? [false, false, false, false, false] : prev.lockedDice);
      return {
        ...prev,
        dice: newDice,
        rollsLeft: prev.rollsLeft - 1,
        isRolling: true,
        lockedDice: prev.rollsLeft === 3 ? [false, false, false, false, false] : prev.lockedDice,
      };
    });
    // Update last roll time for 48h expiry
    updateLastRollTime();
    setTimeout(() => {
      setGameState(prev => prev ? { ...prev, isRolling: false } : prev);
    }, 700);
  }, []);

  const toggleLock = useCallback((index: number) => {
    setGameState(prev => {
      if (!prev || prev.rollsLeft === 3 || prev.rollsLeft === 0 && false) return prev;
      const newLocked = [...prev.lockedDice];
      newLocked[index] = !newLocked[index];
      return { ...prev, lockedDice: newLocked };
    });
  }, []);

  const setLocks = useCallback((locks: boolean[]) => {
    setGameState(prev => {
      if (!prev) return prev;
      return { ...prev, lockedDice: locks };
    });
  }, []);

  const getPossibleScores = useCallback((): Record<CategoryId, number> | null => {
    if (!gameState || gameState.rollsLeft === 3) return null;
    const result: Record<string, number> = {};
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    CATEGORIES.forEach(cat => {
      if (currentPlayer.scores[cat.id] === undefined || currentPlayer.scores[cat.id] === null) {
        result[cat.id] = calculateScore(gameState.dice, cat.id);
      }
    });
    return result as Record<CategoryId, number>;
  }, [gameState]);

  const selectCategory = useCallback((categoryId: CategoryId) => {
    setGameState(prev => {
      if (!prev || prev.rollsLeft === 3) return prev;
      const currentPlayer = prev.players[prev.currentPlayerIndex];
      if (currentPlayer.scores[categoryId] !== undefined && currentPlayer.scores[categoryId] !== null) return prev;

      const score = calculateScore(prev.dice, categoryId);
      const updatedPlayers = prev.players.map((p, i) => {
        if (i !== prev.currentPlayerIndex) return p;
        return { ...p, scores: { ...p.scores, [categoryId]: score } };
      });

      const allFilled = CATEGORIES.every(cat => updatedPlayers[prev.currentPlayerIndex].scores[cat.id] !== undefined && updatedPlayers[prev.currentPlayerIndex].scores[cat.id] !== null);
      
      let nextPlayerIndex = (prev.currentPlayerIndex + 1) % prev.players.length;
      let gameOver = false;

      if (allFilled && nextPlayerIndex <= prev.currentPlayerIndex) {
        const allDone = updatedPlayers.every(p => CATEGORIES.every(cat => p.scores[cat.id] !== undefined && p.scores[cat.id] !== null));
        if (allDone) gameOver = true;
      }

      if (gameOver) {
        clearActiveGame();
      }

      return {
        ...prev,
        players: updatedPlayers,
        currentPlayerIndex: gameOver ? prev.currentPlayerIndex : nextPlayerIndex,
        dice: [1, 1, 1, 1, 1],
        lockedDice: [false, false, false, false, false],
        rollsLeft: 3,
        gameOver,
        round: nextPlayerIndex === 0 ? prev.round + 1 : prev.round,
      };
    });
  }, []);

  const resetGame = useCallback(() => {
    clearActiveGame();
    setGameState(null);
  }, []);

  return {
    gameState,
    startGame,
    roll,
    toggleLock,
    setLocks,
    getPossibleScores,
    selectCategory,
    resetGame,
  };
}
