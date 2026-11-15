/** Local writes fall back to tab storage; pending writes retry without deleting other data. */
const PREFIX = 'mrb_storage_backup:';
type Backup = { value: string | null; base: string | null };
const pending = new Map<string, Backup>();
let paused = false;
const backupKey = (key: string) => `${PREFIX}${key}`;
function localValue(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } }
function readBackup(key: string): Backup | null {
  if (pending.has(key)) return pending.get(key) ?? null;
  try {
    const raw = sessionStorage.getItem(backupKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && (typeof parsed.value === 'string' || parsed.value === null) && (typeof parsed.base === 'string' || parsed.base === null)) return parsed;
  } catch { /* blocked */ }
  return null;
}

export function readRecoverable(key: string): string | null {
  const local = localValue(key);
  const backup = readBackup(key);
  // Never roll back a value committed by a different tab or a newer writer.
  if (!paused && backup && (local === backup.base || local === backup.value)) return backup.value;
  return local;
}

/** False means neither durable store accepted it; only explicitly staged data stays in memory. */
export function writeRecoverable(key: string, value: string, stage = false): boolean {
  if (paused) return false;
  const base = readBackup(key)?.base ?? localValue(key);
  try {
    localStorage.setItem(key, value);
    pending.delete(key);
    try { sessionStorage.removeItem(backupKey(key)); } catch {
      const latest = { value, base: value };
      pending.set(key, latest);
      try { sessionStorage.setItem(backupKey(key), JSON.stringify(latest)); } catch { /* both blocked */ }
    }
    return true;
  } catch {
    try {
      sessionStorage.setItem(backupKey(key), JSON.stringify({ value, base }));
      pending.delete(key);
      return true;
    } catch {
      if (stage) pending.set(key, { value, base });
      return false;
    }
  }
}

export function removeRecoverable(key: string): void {
  const tombstone = { value: null, base: localValue(key) };
  pending.set(key, tombstone);
  try { sessionStorage.setItem(backupKey(key), JSON.stringify(tombstone)); } catch { /* blocked */ }
  try {
    localStorage.removeItem(key);
    sessionStorage.removeItem(backupKey(key));
    pending.delete(key);
  } catch { /* tombstone retries instead of restoring removed data */ }
}

export function retryRecoverableWrites(): void {
  if (paused || localValue('mrb_data_deletion_cleanup') === '1') return;
  const entries = new Map(pending);
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (!key.startsWith(PREFIX)) continue;
      const target = key.slice(PREFIX.length);
      const backup = readBackup(target);
      if (backup && !entries.has(target)) entries.set(target, backup);
    }
  } catch { /* blocked */ }
  for (const [key, backup] of entries) {
    const local = localValue(key);
    if (local !== backup.base && local !== backup.value) {
      pending.delete(key);
      try { sessionStorage.removeItem(backupKey(key)); } catch { /* stale backup remains ignored */ }
      continue;
    }
    if (backup.value === null) removeRecoverable(key);
    else writeRecoverable(key, backup.value, true);
  }
}

/** Called after server-accepted deletion; in-memory backups must never restore deleted data. */
export function forgetRecoverableWrites(): void { pending.clear(); }
export function pauseRecoverableWrites(): void { paused = true; pending.clear(); }
export function resumeRecoverableWrites(): void { paused = false; }

if (typeof window !== 'undefined') {
  window.setInterval(retryRecoverableWrites, 1500);
  window.addEventListener('focus', retryRecoverableWrites);
  window.addEventListener('online', retryRecoverableWrites);
}