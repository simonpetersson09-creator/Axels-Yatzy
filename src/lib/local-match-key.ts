/** A slot can host replays, so its current match identity is stored separately. */
import { readRecoverable, writeRecoverable } from './recoverable-storage';
export function getLocalMatchKey(localGameId: string): string {
  const storageKey = `yatzy-match-key:${localGameId}`;
  try {
    const snapshot = JSON.parse(readRecoverable(`yatzy_saved_game:${localGameId}`) ?? 'null');
    if (snapshot && typeof snapshot.matchKey === 'string') return snapshot.matchKey;
    // An old finished snapshot must not acquire a newer replay identity.
    if (snapshot?.gameOver) return `local:${localGameId}`;
  } catch { /* corrupt snapshots are rejected by the game hook */ }
  const existing = readRecoverable(storageKey);
  if (existing) return existing;
  // Deterministic fallback also survives a remount of an existing saved match.
  const key = `local:${localGameId}`;
  writeRecoverable(storageKey, key, true);
  return key;
}

export function startNextLocalMatch(localGameId: string): string {
  const key = `local:${localGameId}:${crypto.randomUUID()}`;
  writeRecoverable(`yatzy-match-key:${localGameId}`, key, true);
  return key;
}

/** Snapshot writers use the staged replay identity, not the preceding snapshot's key. */
export function getCurrentLocalMatchKey(localGameId: string): string {
  return readRecoverable(`yatzy-match-key:${localGameId}`) ?? `local:${localGameId}`;
}
/** After this many "Spela igen" in a row, the next result offers only Home. */
export const MAX_LOCAL_REPLAYS = 2;
export function getLocalReplayCount(localGameId: string): number {
  const n = Number(readRecoverable(`yatzy-replays:${localGameId}`) ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}
export function canReplayLocal(replays: number): boolean {
  return replays < MAX_LOCAL_REPLAYS;
}
export function bumpLocalReplayCount(localGameId: string): number {
  const next = getLocalReplayCount(localGameId) + 1;
  writeRecoverable(`yatzy-replays:${localGameId}`, String(next), true);
  return next;
}
