const GAMES_KEY = 'yatzy_active_games';
const SAVED_GAME_KEY = 'yatzy_saved_game';
const LEGACY_KEY = 'yatzy_active_game';
const GAME_EXPIRY_MS = 48 * 60 * 60 * 1000; // 48 hours

export const MAX_ACTIVE_MULTIPLAYER_GAMES = 3;

export interface ActiveGame {
  type: 'local' | 'multiplayer';
  gameId?: string;
  timestamp: number;
  lastRollTime: number;
  opponentName?: string;
}

function readList(): ActiveGame[] {
  const raw = localStorage.getItem(GAMES_KEY);
  if (raw) {
    try {
      const arr = JSON.parse(raw) as ActiveGame[];
      if (Array.isArray(arr)) {
        return arr.map(g => ({ ...g, lastRollTime: g.lastRollTime ?? g.timestamp }));
      }
    } catch { /* ignore */ }
  }
  // Migrate legacy single entry
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (legacy) {
    try {
      const g = JSON.parse(legacy) as ActiveGame;
      g.lastRollTime = g.lastRollTime ?? g.timestamp;
      const list = [g];
      localStorage.setItem(GAMES_KEY, JSON.stringify(list));
      return list;
    } catch { /* ignore */ }
  }
  return [];
}

function writeList(list: ActiveGame[]) {
  localStorage.setItem(GAMES_KEY, JSON.stringify(list));
  // Keep legacy key in sync with the most-recent entry for any straggler readers.
  const latest = list[0];
  if (latest) {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(latest));
  } else {
    localStorage.removeItem(LEGACY_KEY);
  }
}

export function getActiveGames(): ActiveGame[] {
  return readList().sort((a, b) => b.lastRollTime - a.lastRollTime);
}

export function getMultiplayerActiveGames(): ActiveGame[] {
  return getActiveGames().filter(g => g.type === 'multiplayer' && g.gameId);
}

export function countActiveMultiplayerGames(): number {
  return getMultiplayerActiveGames().length;
}

/** Most-recent entry — kept for backwards compatibility. */
export function getActiveGame(): ActiveGame | null {
  return getActiveGames()[0] ?? null;
}

export function setActiveGame(
  game: Omit<ActiveGame, 'lastRollTime'> & { lastRollTime?: number },
) {
  const list = readList();
  const now = Date.now();
  if (game.type === 'local') {
    // Only one local game at a time — replace any existing local entry.
    const filtered = list.filter(g => g.type !== 'local');
    const existing = list.find(g => g.type === 'local');
    filtered.unshift({
      ...game,
      lastRollTime: game.lastRollTime ?? existing?.lastRollTime ?? now,
    });
    writeList(filtered);
    return;
  }
  // Multiplayer — upsert by gameId
  if (!game.gameId) return;
  const idx = list.findIndex(g => g.type === 'multiplayer' && g.gameId === game.gameId);
  const existing = idx >= 0 ? list[idx] : undefined;
  const entry: ActiveGame = {
    ...existing,
    ...game,
    lastRollTime: game.lastRollTime ?? existing?.lastRollTime ?? now,
  };
  if (idx >= 0) list[idx] = entry;
  else list.unshift(entry);
  writeList(list);
}

export function updateLastRollTime(gameId?: string) {
  const list = readList();
  const target = gameId
    ? list.find(g => g.gameId === gameId)
    : list[0];
  if (target) {
    target.lastRollTime = Date.now();
    writeList(list);
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

/** Remove a specific multiplayer game from the active list. */
export function removeActiveGame(gameId: string) {
  const list = readList().filter(g => g.gameId !== gameId);
  writeList(list);
}

/** Remove the local active entry. */
export function clearLocalActiveGame() {
  const list = readList().filter(g => g.type !== 'local');
  writeList(list);
  localStorage.removeItem(SAVED_GAME_KEY);
}

/**
 * Legacy clear: removes the most-recent entry. New code should prefer
 * `removeActiveGame(gameId)` or `clearLocalActiveGame()`.
 */
export function clearActiveGame() {
  const list = readList();
  const [, ...rest] = list;
  writeList(rest);
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
