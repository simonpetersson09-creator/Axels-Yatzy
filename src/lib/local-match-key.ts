/** A slot can host replays, so its current match identity is stored separately. */
import { readRecoverable, writeRecoverable } from './recoverable-storage';
export function getLocalMatchKey(localGameId: string): string {
  const storageKey = `yatzy-match-key:${localGameId}`;
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