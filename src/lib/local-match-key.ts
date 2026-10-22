/** A slot can host replays, so its current match identity is stored separately. */
export function getLocalMatchKey(localGameId: string): string {
  const storageKey = `yatzy-match-key:${localGameId}`;
  const existing = localStorage.getItem(storageKey);
  if (existing) return existing;
  // Deterministic fallback also survives a remount of an existing saved match.
  const key = `local:${localGameId}`;
  localStorage.setItem(storageKey, key);
  return key;
}

export function startNextLocalMatch(localGameId: string): string {
  const key = `local:${localGameId}:${crypto.randomUUID()}`;
  localStorage.setItem(`yatzy-match-key:${localGameId}`, key);
  return key;
}