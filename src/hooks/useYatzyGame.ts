import { useState, useCallback, useEffect, useRef } from 'react';
import { GameState, Player, CategoryId, CATEGORIES } from '@/types/yatzy';
import { calculateScore, rollDice } from '@/lib/yatzy-scoring';
import { aiDecideLocks, aiPickCategory } from '@/lib/yatzy-ai';
import { setActiveGame, updateLastRollTime, saveGameState, loadGameState, clearLocalActiveGame } from '@/lib/active-game';

function createPlayer(name: string, index: number): Player {
  return {
    id: `player-${index}`,
    name,
    scores: {},
  };
}

/**
 * A persisted save can be truncated (iOS kills the app mid-write) or come from
 * an older/newer schema. Anything that fails this check is discarded rather
 * than handed to the UI, which indexes `players` unconditionally.
 */
function isValidGameState(value: unknown): value is GameState {
  if (!value || typeof value !== 'object') return false;
  const s = value as Partial<GameState>;
  if (!Array.isArray(s.players) || s.players.length === 0) return false;
  const playersOk = s.players.every(
    p => p && typeof p === 'object' && typeof p.id === 'string' &&
      typeof p.name === 'string' && p.scores && typeof p.scores === 'object',
  );
  if (!playersOk) return false;
  if (typeof s.currentPlayerIndex !== 'number' ||
      s.currentPlayerIndex < 0 || s.currentPlayerIndex >= s.players.length) return false;
  if (!Array.isArray(s.dice) || s.dice.length !== 5) return false;
  if (!Array.isArray(s.lockedDice) || s.lockedDice.length !== 5) return false;
  if (typeof s.rollsLeft !== 'number' || typeof s.round !== 'number') return false;
  if (typeof s.gameOver !== 'boolean') return false;
  return true;
}

/** Pure scoring step: writes the category for the current player and advances the turn. */
function applyCategory(prev: GameState | null, categoryId: CategoryId): GameState | null {
  if (!prev || prev.rollsLeft === 3) return prev;
  const currentPlayer = prev.players[prev.currentPlayerIndex];
  if (currentPlayer.scores[categoryId] !== undefined && currentPlayer.scores[categoryId] !== null) return prev;

  const score = calculateScore(prev.dice, categoryId);
  const updatedPlayers = prev.players.map((p, i) => {
    if (i !== prev.currentPlayerIndex) return p;
    return { ...p, scores: { ...p.scores, [categoryId]: score } };
  });

  const allDone = updatedPlayers.every(p => CATEGORIES.every(cat => p.scores[cat.id] !== undefined && p.scores[cat.id] !== null));
  const gameOver = allDone;

  let nextPlayerIndex = (prev.currentPlayerIndex + 1) % prev.players.length;
  if (!gameOver) {
    for (let i = 0; i < prev.players.length; i++) {
      const candidate = (prev.currentPlayerIndex + 1 + i) % prev.players.length;
      const hasOpen = CATEGORIES.some(cat => updatedPlayers[candidate].scores[cat.id] === undefined || updatedPlayers[candidate].scores[cat.id] === null);
      if (hasOpen) {
        nextPlayerIndex = candidate;
        break;
      }
    }
  }

  // Bump the round whenever we loop back (not only at index 0): the first
  // player can finish early, and round-derived keys in GamePage would freeze.
  const wrapped = !gameOver && nextPlayerIndex <= prev.currentPlayerIndex;
  return {
    ...prev,
    players: updatedPlayers,
    currentPlayerIndex: gameOver ? prev.currentPlayerIndex : nextPlayerIndex,
    dice: [1, 1, 1, 1, 1],
    lockedDice: [false, false, false, false, false],
    rollsLeft: 3,
    gameOver,
    round: wrapped ? prev.round + 1 : prev.round,
  };
}

/**
 * When the app was closed during the computer's turn, play all pending
 * computer turns instantly so the player comes back to their own turn.
 */
export interface AiCatchUpTurn { name: string; category: CategoryId; score: number }

function fastForwardAi(state: GameState, localId?: string, log?: AiCatchUpTurn[]): GameState {
  let ai: number[] = [];
  try {
    const raw = localId ? localStorage.getItem(`yatzy-ai-players:${localId}`) : null;
    ai = raw ? JSON.parse(raw) : [];
  } catch { ai = []; }
  if (!Array.isArray(ai) || ai.length === 0) return state;
  // Never auto-play the human seat (index 0), even if a save is corrupt.
  ai = ai.filter(i => i !== 0);
  if (ai.length === 0) return state;

  let s: GameState = state;
  let guard = 0;
  while (!s.gameOver && ai.includes(s.currentPlayerIndex) && guard++ < 200) {
    const scores = s.players[s.currentPlayerIndex].scores;
    if (s.rollsLeft > 0) {
      const locks = s.rollsLeft === 3 ? [false, false, false, false, false] : s.lockedDice;
      s = { ...s, dice: rollDice(s.dice, locks), lockedDice: locks, rollsLeft: s.rollsLeft - 1 };
      if (s.rollsLeft > 0) {
        s = { ...s, lockedDice: aiDecideLocks(s.dice, scores, s.rollsLeft) };
        if (s.lockedDice.every(Boolean)) s = { ...s, rollsLeft: 0 };
      }
      continue;
    }
    const cat = aiPickCategory(s.dice, scores);
    const next = applyCategory(s, cat);
    if (!next || next === s) break;
    log?.push({ name: s.players[s.currentPlayerIndex].name, category: cat, score: calculateScore(s.dice, cat) });
    s = next;
  }
  if (s.gameOver) clearLocalActiveGame(localId);
  return s;
}

export function useYatzyGame(localId?: string) {
  const localIdRef = useRef(localId);
  localIdRef.current = localId;
  const catchUpRef = useRef<AiCatchUpTurn[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(() => {
    // Try to restore saved game on mount. `isRolling` must never survive a
    // reload/suspension: the timer that would have cleared it is gone, so a
    // persisted `true` freezes the game (the AI effect bails while rolling).
    const saved = loadGameState<unknown>(localId);
    if (!isValidGameState(saved)) {
      if (saved) {
        console.warn('Discarding corrupt saved game state');
        clearLocalActiveGame(localId);
      }
      return null;
    }
    return fastForwardAi({ ...saved, isRolling: false }, localId, catchUpRef.current);
  });
  const [aiCatchUp] = useState<AiCatchUpTurn[]>(() => catchUpRef.current);
  const rollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (rollTimeoutRef.current) clearTimeout(rollTimeoutRef.current);
    };
  }, []);

  // Safety net: if the app was suspended mid-roll (iOS throttles/kills timers),
  // `isRolling` can stay true with no pending timeout. Clear it on resume.
  useEffect(() => {
    const unstick = () => {
      if (document.visibilityState !== 'visible') return;
      if (rollTimeoutRef.current) return;
      setGameState(prev => (prev?.isRolling ? { ...prev, isRolling: false } : prev));
    };
    document.addEventListener('visibilitychange', unstick);
    window.addEventListener('focus', unstick);
    const iv = setInterval(unstick, 1000);
    return () => {
      document.removeEventListener('visibilitychange', unstick);
      window.removeEventListener('focus', unstick);
      clearInterval(iv);
    };
  }, []);



  // Persist game state on every change
  useEffect(() => {
    if (gameState && !gameState.gameOver) {
      saveGameState(gameState, localId);
      setActiveGame({
        type: 'local',
        gameId: localId,
        timestamp: Date.now(),
        currentPlayerIndex: gameState.currentPlayerIndex,
      });
    }
  }, [gameState, localId]);

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
    if (rollTimeoutRef.current) clearTimeout(rollTimeoutRef.current);
    rollTimeoutRef.current = setTimeout(() => {
      rollTimeoutRef.current = null;
      setGameState(prev => prev ? { ...prev, isRolling: false } : prev);
    }, 1350);
  }, []);

  const toggleLock = useCallback((index: number) => {
    setGameState(prev => {
      if (!prev || prev.rollsLeft === 3 || prev.rollsLeft === 0) return prev;
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

  const selectCategory = useCallback((categoryId: CategoryId, debug?: { rowText?: string; clickedCategoryId?: CategoryId; renderedRowIndex?: number | null; score?: number | null }) => {
    setGameState(prev => {
      const next = applyCategory(prev, categoryId);
      if (next !== prev && next?.gameOver) clearLocalActiveGame(localIdRef.current);
      return next;
    });
  }, []);

  const resetGame = useCallback(() => {
    clearLocalActiveGame(localIdRef.current);
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
    aiCatchUp,
  };
}
