// Local alias map for "merging" duplicate friend cards on the Vänner page.
// Example: a friend changed phone / cleared app data and now shows up as a new
// session_id. The user can merge the new card into the old one so all matches
// aggregate under a single card.
//
// Stored only on this device — purely a presentation layer concern. The raw
// rows in `friend_match_results` are never modified.

const ALIASES_KEY = 'yatzy_friend_aliases';

export type AliasMap = Record<string, string>;

export function getFriendAliases(): AliasMap {
  try {
    const raw = localStorage.getItem(ALIASES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: AliasMap = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string' && k !== v) out[k] = v;
      }
      return out;
    }
  } catch { /* noop */ }
  return {};
}

function writeAliases(map: AliasMap): void {
  localStorage.setItem(ALIASES_KEY, JSON.stringify(map));
  window.dispatchEvent(new Event('friend-aliases-changed'));
}

/** Resolve an id to its canonical id (follows the chain, with cycle guard). */
export function resolveFriendId(id: string, map?: AliasMap): string {
  const m = map ?? getFriendAliases();
  let cur = id;
  const seen = new Set<string>();
  while (m[cur] && !seen.has(cur)) {
    seen.add(cur);
    cur = m[cur];
  }
  return cur;
}

/** Merge `fromId` INTO `toId`: future aggregation treats `fromId` as `toId`. */
export function mergeFriend(fromId: string, toId: string): void {
  if (!fromId || !toId || fromId === toId) return;
  const map = getFriendAliases();
  // Re-target any existing aliases that point to fromId so the chain stays flat.
  for (const k of Object.keys(map)) {
    if (map[k] === fromId) map[k] = toId;
  }
  map[fromId] = toId;
  writeAliases(map);
}

/** Undo a merge: remove the alias so `fromId` shows up as its own card again. */
export function unmergeFriend(fromId: string): void {
  const map = getFriendAliases();
  if (fromId in map) {
    delete map[fromId];
    writeAliases(map);
  }
}

/** Return all raw session_ids that resolve to the given canonical id. */
export function getMergedIds(canonicalId: string, map?: AliasMap): string[] {
  const m = map ?? getFriendAliases();
  const out = [canonicalId];
  for (const [k, v] of Object.entries(m)) {
    if (v === canonicalId && k !== canonicalId) out.push(k);
  }
  return out;
}

export function subscribeFriendAliases(cb: () => void): () => void {
  const h = () => cb();
  window.addEventListener('friend-aliases-changed', h);
  window.addEventListener('storage', h);
  return () => {
    window.removeEventListener('friend-aliases-changed', h);
    window.removeEventListener('storage', h);
  };
}
