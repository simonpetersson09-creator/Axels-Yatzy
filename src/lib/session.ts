const SESSION_KEY = 'yatzy_session_id';
const PLAYER_NAME_KEY = 'yatzy_player_name';

export function getSessionId(): string {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

// Kept as a thin wrapper for backwards compatibility.
// Profile data now lives in src/lib/profile.ts (local-only, no auth).
export function getPlayerName(): string {
  return localStorage.getItem(PLAYER_NAME_KEY) || '';
}

export function setPlayerName(name: string): void {
  localStorage.setItem(PLAYER_NAME_KEY, name.trim());
}
