const ACTIVE_GAME_KEY = 'yatzy_active_game';

export interface ActiveGame {
  type: 'local' | 'multiplayer';
  gameId?: string; // for multiplayer
  timestamp: number;
}

export function setActiveGame(game: ActiveGame) {
  localStorage.setItem(ACTIVE_GAME_KEY, JSON.stringify(game));
}

export function getActiveGame(): ActiveGame | null {
  const raw = localStorage.getItem(ACTIVE_GAME_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearActiveGame() {
  localStorage.removeItem(ACTIVE_GAME_KEY);
}
