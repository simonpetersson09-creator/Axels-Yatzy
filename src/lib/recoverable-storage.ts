/** Local writes fall back to tab storage; pending writes retry without deleting other data. */
const PREFIX = 'mrb_storage_backup:';
const pending = new Map<string, string>();
const backupKey = (key: string) => `${PREFIX}${key}`;

export function readRecoverable(key: string): string | null {
  if (pending.has(key)) return pending.get(key) ?? null;
  try {
    const backup = sessionStorage.getItem(backupKey(key));
    if (backup !== null) return backup;
  } catch { /* storage may be blocked */ }
  try { return localStorage.getItem(key); } catch { return null; }
}

/** False means neither durable store accepted it; only explicitly staged data stays in memory. */
export function writeRecoverable(key: string, value: string, stage = false): boolean {
  try {
    localStorage.setItem(key, value);
    pending.delete(key);
    try { sessionStorage.removeItem(backupKey(key)); } catch { /* retried below */ }
    return true;
  } catch {
    try {
      sessionStorage.setItem(backupKey(key), value);
      pending.delete(key);
      return true;
    } catch {
      if (stage) pending.set(key, value);
      return false;
    }
  }
}

export function removeRecoverable(key: string): void {
  pending.delete(key);
  try { sessionStorage.removeItem(backupKey(key)); } catch { /* blocked */ }
  try { localStorage.removeItem(key); } catch { /* blocked */ }
}

export function retryRecoverableWrites(): void {
  const entries = new Map(pending);
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (!key.startsWith(PREFIX)) continue;
      const value = sessionStorage.getItem(key);
      if (value !== null && !entries.has(key.slice(PREFIX.length))) entries.set(key.slice(PREFIX.length), value);
    }
  } catch { /* blocked */ }
  for (const [key, value] of entries) writeRecoverable(key, value, true);
}

/** Called after server-accepted deletion; in-memory backups must never restore deleted data. */
export function forgetRecoverableWrites(): void { pending.clear(); }

if (typeof window !== 'undefined') {
  window.setInterval(retryRecoverableWrites, 1500);
  window.addEventListener('focus', retryRecoverableWrites);
  window.addEventListener('online', retryRecoverableWrites);
}