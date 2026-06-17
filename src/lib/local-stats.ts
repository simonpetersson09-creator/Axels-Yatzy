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
const CURRENT_VERSION = 1;

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
  const version: number = typeof parsed?.version === 'number' ? parsed.version : 0;

  const base: LocalStats = {
    gamesPlayed: parsed?.gamesPlayed ?? 0,
    wins: parsed?.wins ?? 0,
    highScore: parsed?.highScore ?? 0,
    yatzyCount: parsed?.yatzyCount ?? 0,
    currentStreak: parsed?.currentStreak ?? 0,
    bestStreak: parsed?.bestStreak ?? 0,
  };

  // Future migrations go here:
  // if (version < 2) { ...transform base... }

  void version;
  return { ...base, version: CURRENT_VERSION };
}

export function getLocalStats(): LocalStats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return { ...DEFAULT_STATS };
    const migrated = migrate(JSON.parse(raw));
    // Persist back if we upgraded an older record, so we only migrate once.
    const { version, ...rest } = migrated;
    return rest;
  } catch {
    return { ...DEFAULT_STATS };
  }
}

export function saveLocalStats(stats: LocalStats): void {
  const toStore: StoredStats = { ...stats, version: CURRENT_VERSION };
  localStorage.setItem(STATS_KEY, JSON.stringify(toStore));
}

export function recordGameResult(playerScore: number, won: boolean, yatzysThisGame = 0): void {
  const stats = getLocalStats();
  stats.gamesPlayed += 1;
  if (won) {
    stats.wins += 1;
    stats.currentStreak += 1;
    if (stats.currentStreak > stats.bestStreak) stats.bestStreak = stats.currentStreak;
  } else {
    stats.currentStreak = 0;
  }
  if (playerScore > stats.highScore) stats.highScore = playerScore;
  if (yatzysThisGame > 0) stats.yatzyCount += yatzysThisGame;
  saveLocalStats(stats);
  // Update the player's personal country ranking after every finished match.
  // Lazy import to keep this module free of network deps until needed.
  void import('./country-rank').then(m => m.syncCountryRank(stats.gamesPlayed)).catch(() => {});
}
