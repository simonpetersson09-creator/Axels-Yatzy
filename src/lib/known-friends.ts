// Local registry of everyone this device has shared a multiplayer game with.
//
// Friend cards used to be derived purely from `friend_match_results`, which is
// removed for cancelled/abandoned/timed-out matches. That made a friend
// disappear (or never show up) depending on how the match ended. This registry
// is written by BOTH players as soon as they are in the same game, so a friend
// is saved regardless of who sent the invite.

const KEY = 'yatzy_known_friends';

export interface KnownFriend {
  id: string;
  name: string;
  addedAt: string;
}

export function getKnownFriends(): KnownFriend[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (f): f is KnownFriend =>
        !!f && typeof f.id === 'string' && typeof f.name === 'string',
    );
  } catch {
    return [];
  }
}

/** Add/refresh friends. Returns true when something actually changed. */
export function addKnownFriends(
  friends: Array<{ id: string; name: string }>,
): boolean {
  const list = getKnownFriends();
  const byId = new Map(list.map((f) => [f.id, f]));
  let changed = false;
  for (const f of friends) {
    if (!f.id || !f.name) continue;
    const cur = byId.get(f.id);
    if (!cur) {
      byId.set(f.id, { id: f.id, name: f.name, addedAt: new Date().toISOString() });
      changed = true;
    } else if (cur.name !== f.name) {
      byId.set(f.id, { ...cur, name: f.name });
      changed = true;
    }
  }
  if (!changed) return false;
  // Keep the registry bounded.
  const next = Array.from(byId.values()).slice(-200);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event('known-friends-changed'));
  } catch {
    /* ignore quota errors */
  }
  return true;
}

export function subscribeKnownFriends(cb: () => void): () => void {
  const h = () => cb();
  window.addEventListener('known-friends-changed', h);
  window.addEventListener('storage', h);
  return () => {
    window.removeEventListener('known-friends-changed', h);
    window.removeEventListener('storage', h);
  };
}
