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

import { readRecoverable, writeRecoverable } from './recoverable-storage';

const STATS_KEY = 'yatzy-player-stats';
const CURRENT_VERSION = 2;

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
  /** Fully played matches only (no forfeits) — used for country/world rank. */
  completedGames: number;
  pendingReports?: ResultReport[];
}

export interface ResultReport { key: string; score: number; games: number; yatzy: boolean; completedAt: string }
export function isGameResultRecorded(key: string): boolean { return readStored().recordedKeys.includes(key); }
export function getPendingResultReports(): ResultReport[] { return readStored().pendingReports ?? []; }
export function acknowledgeResultReport(key: string): void {
  const stored = readStored();
  writeRecoverable(STATS_KEY, JSON.stringify({ ...stored, pendingReports: (stored.pendingReports ?? []).filter(r => r.key !== key) }));
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
  // Older records: every match counted so far stays counted.
  const completedGames = typeof parsed?.completedGames === 'number' ? parsed.completedGames : base.gamesPlayed;
  const pendingReports = Array.isArray(parsed?.pendingReports) ? parsed.pendingReports : [];
  return { ...base, version: CURRENT_VERSION, recordedKeys, completedGames, pendingReports };
}

function readStored(): StoredStats {
  try {
    const raw = readRecoverable(STATS_KEY);
    if (!raw) return { ...DEFAULT_STATS, version: CURRENT_VERSION, recordedKeys: [], completedGames: 0 };
    return migrate(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_STATS, version: CURRENT_VERSION, recordedKeys: [], completedGames: 0 };
  }
}

export function getLocalStats(): LocalStats {
  const { version, recordedKeys, completedGames, pendingReports, ...rest } = readStored();
  void version; void recordedKeys; void completedGames; void pendingReports;
  return rest;
}

/** Matches played to the end (forfeits excluded) — the number country/world rank uses. */
export function getRankedGames(): number {
  return readStored().completedGames;
}

export function saveLocalStats(stats: LocalStats): void {
  const prev = readStored();
  const completedGames = Math.max(0, prev.completedGames + (stats.gamesPlayed - prev.gamesPlayed));
  const toStore: StoredStats = { ...stats, version: CURRENT_VERSION, recordedKeys: prev.recordedKeys, completedGames, pendingReports: prev.pendingReports };
  writeRecoverable(STATS_KEY, JSON.stringify(toStore));
}

/** Wipe stats *and* the dedupe ledger (used by "reset statistics"). */
export function resetLocalStats(): void {
  const toStore: StoredStats = { ...DEFAULT_STATS, version: CURRENT_VERSION, recordedKeys: [], completedGames: 0 };
  writeRecoverable(STATS_KEY, JSON.stringify(toStore));
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
  /** false for forfeited/unfinished matches — they never reach the weekly top lists. */
  completed = true,
): boolean {
  // Forward-only: never rewrite old totals or let an unfinished match affect
  // any statistic, the dedupe ledger, or a server leaderboard.
  if (!completed) return false;
  const stored = readStored();
  if (matchKey && stored.recordedKeys.includes(matchKey)) return false;

  const stats: LocalStats = {
    // Forfeits (completed=false) never count as played matches — matching the
    // online path, which records nothing at all for forfeited games.
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
  if (yatzysThisGame > 0) stats.yatzyCount += 1;

  const recordedKeys = matchKey
    ? [...stored.recordedKeys, matchKey]
    : stored.recordedKeys;

  const completedGames = stored.completedGames + 1;
  const pendingReports = [...(stored.pendingReports ?? []), { key: matchKey ?? `local:${crypto.randomUUID()}`, score: playerScore, games: completedGames, yatzy: yatzysThisGame > 0 && !matchKey?.startsWith('mp:'), completedAt: new Date().toISOString() }];
  const toStore: StoredStats = { ...stats, version: CURRENT_VERSION, recordedKeys, completedGames, pendingReports };
  // Stats and their match key commit in one write. Do not report/reward a
  // result that failed to persist; a later attempt may retry it safely.
  if (!writeRecoverable(STATS_KEY, JSON.stringify(toStore))) return false;

  // Update the player's personal country ranking after every finished match.
  // Lazy import to keep this module free of network deps until needed.
  void import('./result-delivery').then(m => m.flushResultReports()).catch(() => {});
  // Weekly Hall of Fame: name, matches this week and best score in one match.
  // Only fully played matches count (forfeits are excluded).
  return true;
}
