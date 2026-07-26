/**
 * Local player statistics.
 *
 * Persistence: stored in `localStorage` under STATS_KEY. On iOS (Capacitor /
 * WKWebView) this storage survives normal App Store updates — it only clears
 * if the user deletes the app, iOS offloads it, or the user clears app data.
 *
 * Schema versioning: every saved record carries a `version` field. When the
 * shape changes in the future, add a new case to `migrate()` so old data is
 * upgraded in place instead of being overwritten/lost.
 */

const STATS_KEY = 'yatzy-player-stats';
const CURRENT_VERSION = 2;
const MAX_RECORDED_KEYS = 300;

export interface LocalStats {
  gamesPlayed: number;
  wins: number;
  highScore: number;
  yatzyCount: number;
  currentStreak: number;
  bestStreak: number;
}

interface StoredStats extends LocalStats {
  version: number;
  /** Match keys already counted — the single source of truth against double counting. */
  recordedKeys: string[];
}

const DEFAULT_STATS: LocalStats = {
  gamesPlayed: 0,
  wins: 0,
  highScore: 0,
  yatzyCount: 0,
  currentStreak: 0,
  bestStreak: 0,
};

/**
 * Migrate older stored shapes up to CURRENT_VERSION. Never destructive —
 * unknown fields are preserved and missing fields fall back to defaults.
 */
function migrate(parsed: any): StoredStats {
  // v0 (no version field) → v1: same shape, just stamp it.
  // v1 → v2: add `recordedKeys` so every match can only ever be counted once.
  const version: number = typeof parsed?.version === 'number' ? parsed.version : 0;

  const base: LocalStats = {
    gamesPlayed: parsed?.gamesPlayed ?? 0,
    wins: parsed?.wins ?? 0,
    highScore: parsed?.highScore ?? 0,
    yatzyCount: parsed?.yatzyCount ?? 0,
    currentStreak: parsed?.currentStreak ?? 0,
    bestStreak: parsed?.bestStreak ?? 0,
  };

  const recordedKeys: string[] = Array.isArray(parsed?.recordedKeys)
    ? parsed.recordedKeys.filter((k: unknown) => typeof k === 'string')
    : [];

  void version;
  return { ...base, version: CURRENT_VERSION, recordedKeys };
}

function readStored(): StoredStats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return { ...DEFAULT_STATS, version: CURRENT_VERSION, recordedKeys: [] };
    return migrate(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_STATS, version: CURRENT_VERSION, recordedKeys: [] };
  }
}

export function getLocalStats(): LocalStats {
  const { version, recordedKeys, ...rest } = readStored();
  void version; void recordedKeys;
  return rest;
}

export function saveLocalStats(stats: LocalStats): void {
  const prev = readStored();
  const toStore: StoredStats = { ...stats, version: CURRENT_VERSION, recordedKeys: prev.recordedKeys };
  localStorage.setItem(STATS_KEY, JSON.stringify(toStore));
}

/** Wipe stats *and* the dedupe ledger (used by "reset statistics"). */
export function resetLocalStats(): void {
  const toStore: StoredStats = { ...DEFAULT_STATS, version: CURRENT_VERSION, recordedKeys: [] };
  localStorage.setItem(STATS_KEY, JSON.stringify(toStore));
}

/**
 * Record a finished match exactly once.
 *
 * `matchKey` must be stable for a given match (multiplayer: the game id;
 * single player: an id generated when that game started). If the key was
 * already counted the call is a no-op, so reopening a finished match — even
 * after an app restart or crash — can never inflate the statistics.
 */
export function recordGameResult(
  playerScore: number,
  won: boolean,
  yatzysThisGame = 0,
  matchKey?: string,
): boolean {
  const stored = readStored();
  if (matchKey && stored.recordedKeys.includes(matchKey)) return false;

  const stats: LocalStats = {
    gamesPlayed: stored.gamesPlayed + 1,
    wins: stored.wins,
    highScore: stored.highScore,
    yatzyCount: stored.yatzyCount,
    currentStreak: stored.currentStreak,
    bestStreak: stored.bestStreak,
  };

  if (won) {
    stats.wins += 1;
    stats.currentStreak += 1;
    if (stats.currentStreak > stats.bestStreak) stats.bestStreak = stats.currentStreak;
  } else {
    stats.currentStreak = 0;
  }
  if (playerScore > stats.highScore) stats.highScore = playerScore;
  if (yatzysThisGame > 0) stats.yatzyCount += yatzysThisGame;

  const recordedKeys = matchKey
    ? [...stored.recordedKeys, matchKey].slice(-MAX_RECORDED_KEYS)
    : stored.recordedKeys;

  const toStore: StoredStats = { ...stats, version: CURRENT_VERSION, recordedKeys };
  try { localStorage.setItem(STATS_KEY, JSON.stringify(toStore)); } catch { /* noop */ }

  // Update the player's personal country ranking after every finished match.
  // Lazy import to keep this module free of network deps until needed.
  void import('./country-rank').then(m => m.syncCountryRank(stats.gamesPlayed)).catch(() => {});
  return true;
}
