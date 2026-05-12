// Analytics session manager.
//
// - A session starts at app open / refresh / when returning from
//   background after >30 min of inactivity.
// - Each session has its own UUID and a row in `analytics_sessions`
//   (started_at, last_seen_at, ended_at, duration_seconds).
// - Sessions end on pagehide / visibility=hidden, or get auto-closed
//   server-side later if they were never explicitly closed.

import { supabase } from '@/integrations/supabase/client';
import { getDeviceIdSync, initDeviceId } from '@/lib/device';

const BACKGROUND_TIMEOUT_MS = 30 * 60 * 1000;
const HEARTBEAT_MS = 60 * 1000;

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getPlatform(): string {
  try {
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
    if (/Android/i.test(ua)) return 'android';
    return 'web';
  } catch {
    return 'unknown';
  }
}

const APP_VERSION = '1.0.0';

let currentSessionId = newId();
let sessionStartedAt = Date.now();
let lastActivityAt = Date.now();
let hiddenAt: number | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let started = false;

export function getCurrentSessionId(): string {
  return currentSessionId;
}

async function insertSession(id: string, startedAt: number): Promise<void> {
  try {
    await initDeviceId();
    const deviceId = getDeviceIdSync();
    await supabase.from('analytics_sessions').insert({
      id,
      device_id: deviceId,
      platform: getPlatform(),
      app_version: APP_VERSION,
      started_at: new Date(startedAt).toISOString(),
      last_seen_at: new Date(startedAt).toISOString(),
    } as any);
  } catch {
    // Never throw from analytics.
  }
}

async function updateSession(
  id: string,
  patch: { last_seen_at?: string; ended_at?: string; duration_seconds?: number },
): Promise<void> {
  try {
    await supabase.from('analytics_sessions').update(patch as any).eq('id', id);
  } catch {
    // ignore
  }
}

function startSession(): void {
  currentSessionId = newId();
  sessionStartedAt = Date.now();
  lastActivityAt = sessionStartedAt;
  void insertSession(currentSessionId, sessionStartedAt);
}

async function endSession(reason: 'hidden' | 'pagehide'): Promise<void> {
  const endedAt = Date.now();
  const duration = Math.max(0, Math.round((endedAt - sessionStartedAt) / 1000));
  await updateSession(currentSessionId, {
    ended_at: new Date(endedAt).toISOString(),
    duration_seconds: duration,
    last_seen_at: new Date(endedAt).toISOString(),
  });
  // We don't null currentSessionId — it will be replaced on next start.
  void reason;
}

function heartbeat(): void {
  lastActivityAt = Date.now();
  void updateSession(currentSessionId, {
    last_seen_at: new Date(lastActivityAt).toISOString(),
  });
}

function handleVisibility(): void {
  if (document.visibilityState === 'hidden') {
    hiddenAt = Date.now();
    void endSession('hidden');
  } else if (document.visibilityState === 'visible') {
    const wasHiddenFor = hiddenAt ? Date.now() - hiddenAt : 0;
    hiddenAt = null;
    if (wasHiddenFor > BACKGROUND_TIMEOUT_MS) {
      // Returning after long background → brand new session.
      startSession();
    } else {
      // Resume same session.
      heartbeat();
    }
  }
}

export function initSessionTracking(): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  // The constructor-time `currentSessionId` is the one used for events
  // during early app boot. Persist it now.
  void insertSession(currentSessionId, sessionStartedAt);

  document.addEventListener('visibilitychange', handleVisibility);
  window.addEventListener('pagehide', () => {
    void endSession('pagehide');
  });

  heartbeatTimer = setInterval(heartbeat, HEARTBEAT_MS);
}

// Allow manual disposal (mostly for tests).
export function disposeSessionTracking(): void {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  started = false;
}
