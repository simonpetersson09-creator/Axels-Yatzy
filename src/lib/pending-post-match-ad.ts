/**
 * A finished match whose post-match ad was not properly seen (app closed,
 * ad not loaded, or dismissed within a few seconds) is remembered on the
 * device so the next app open shows a post-match ad instead of App Open.
 */
const KEY = 'pending_post_match_ad_v1';
export const PENDING_POST_MATCH_TTL_MS = 24 * 60 * 60 * 1000;
export const PENDING_POST_MATCH_MIN_VIEW_MS = 5_000;
export const PENDING_POST_MATCH_MAX_ATTEMPTS = 2;

interface Pending { matchKey: string; at: number; attempts: number }

function read(): Pending | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Pending;
    if (typeof p?.matchKey !== 'string' || typeof p.at !== 'number') return null;
    return { matchKey: p.matchKey, at: p.at, attempts: Number(p.attempts) || 0 };
  } catch { return null; }
}
function write(p: Pending | null) {
  try { if (p) localStorage.setItem(KEY, JSON.stringify(p)); else localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export function markPendingPostMatchAd(matchKey: string, now = Date.now()) {
  const cur = read();
  if (cur?.matchKey === matchKey) return;
  write({ matchKey, at: now, attempts: 0 });
}

/** Clears only when the ad for this exact match was watched long enough. */
export function settlePostMatchAd(matchKey: string, result: string, viewedMs: number) {
  if (result !== 'shown' || viewedMs < PENDING_POST_MATCH_MIN_VIEW_MS) return;
  const cur = read();
  if (!cur || cur.matchKey === matchKey) write(null);
}

export function getPendingPostMatchAd(now = Date.now()): Pending | null {
  const cur = read();
  if (!cur) return null;
  if (now - cur.at > PENDING_POST_MATCH_TTL_MS || cur.attempts >= PENDING_POST_MATCH_MAX_ATTEMPTS) { write(null); return null; }
  return cur;
}

export function notePendingPostMatchAttempt(matchKey: string) {
  const cur = read();
  if (cur?.matchKey === matchKey) write({ ...cur, attempts: cur.attempts + 1 });
}
