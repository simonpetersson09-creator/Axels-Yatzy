const ACTIVE_GAME_KEY = 'yatzy_active_game';
const SAVED_GAME_KEY = 'yatzy_saved_game';
const GAME_EXPIRY_MS = 48 * 60 * 60 * 1000; // 48 hours

export interface ActiveGame {
  type: 'local' | 'multiplayer';
  gameId?: string;
  timestamp: number;
  lastRollTime: number;
}

export function setActiveGame(game: Omit<ActiveGame, 'lastRollTime'> & { lastRollTime?: number }) {
  const existing = getActiveGame();
  const activeGame: ActiveGame = {
    ...game,
    lastRollTime: game.lastRollTime ?? existing?.lastRollTime ?? Date.now(),
  };
  localStorage.setItem(ACTIVE_GAME_KEY, JSON.stringify(activeGame));
}

export function updateLastRollTime() {
  const game = getActiveGame();
  if (game) {
    game.lastRollTime = Date.now();
    localStorage.setItem(ACTIVE_GAME_KEY, JSON.stringify(game));
  }
}

export function getActiveGame(): ActiveGame | null {
  const raw = localStorage.getItem(ACTIVE_GAME_KEY);
  if (!raw) return null;
  try {
    const game = JSON.parse(raw) as ActiveGame;
    // Backwards compat: if no lastRollTime, use timestamp
    if (!game.lastRollTime) game.lastRollTime = game.timestamp;
    return game;
  } catch {
    return null;
  }
}

export function isGameExpired(game: ActiveGame): boolean {
  return Date.now() - game.lastRollTime > GAME_EXPIRY_MS;
}

export function getTimeRemaining(game: ActiveGame): number {
  const remaining = GAME_EXPIRY_MS - (Date.now() - game.lastRollTime);
  return Math.max(0, remaining);
}

export function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return '0m';
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function clearActiveGame() {
  localStorage.removeItem(ACTIVE_GAME_KEY);
  localStorage.removeItem(SAVED_GAME_KEY);
}

export function saveGameState(state: unknown) {
  localStorage.setItem(SAVED_GAME_KEY, JSON.stringify(state));
}

export function loadGameState<T>(): T | null {
  const raw = localStorage.getItem(SAVED_GAME_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
