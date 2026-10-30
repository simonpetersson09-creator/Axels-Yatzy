// Silent, fire-and-forget analytics. Never throws. Never blocks UI.
import { supabase } from '@/integrations/supabase/client';
import {
  getAuthUserId,
  getDeviceIdSync,
  initDeviceId,
} from '@/lib/device';
import { getCurrentSessionId } from '@/lib/analytics-session';
import { claimSession } from '@/lib/session';
import { markHappyMoment } from '@/lib/rate-app';

import { appVersionReady, getAppVersion } from '@/lib/app-version';

// Resolve the persistent device id as early as possible.
void initDeviceId();

export type AnalyticsEvent =
  | 'app_opened'
  | 'quick_match_started'
  | 'multiplayer_room_created'
  | 'multiplayer_room_joined'
  | 'game_started'
  | 'game_finished'
  | 'game_forfeited'
  | 'yatzy_scored'
  | 'settings_opened'
  | 'language_changed';

interface QueuedEvent {
  event_name: string;
  session_id: string | null;
  device_id: string | null;
  auth_user_id: string | null;
  // Kept for backwards-compatibility with existing rows / queries.
  local_user_id: string | null;
  game_id: string | null;
  game_mode: string | null;
  metadata: Record<string, unknown> | null;
  platform: string;
  app_version: string;
}

function getPlatform(): string {
  try {
    const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
    const native = cap?.getPlatform?.();
    if (native === 'ios' || native === 'android') return native;
    // Browsers on phones are web visitors, not app players — never count
    // them as ios/android.
    return 'web';
  } catch {
    return 'unknown';
  }
}

const queue: QueuedEvent[] = [];
const DIAGNOSTIC_KEY = 'play-diagnostics-pending-v1';
const isDiagnostic = (e: QueuedEvent) => e.event_name.startsWith('play_') || e.event_name === 'post_match_exit';
function persistDiagnostics(): void {
  try { localStorage.setItem(DIAGNOSTIC_KEY, JSON.stringify(queue.filter(isDiagnostic).slice(-200))); } catch { /* Storage is best-effort. */ }
}
try {
  const saved: unknown = JSON.parse(localStorage.getItem(DIAGNOSTIC_KEY) ?? '[]');
  if (Array.isArray(saved)) queue.push(...saved.filter((e): e is QueuedEvent => !!e && typeof e.event_name === 'string' && isDiagnostic(e)).slice(-200));
} catch { /* Corrupt storage must not block play. */ }
let flushing = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_DELAY_MS = 1500;
const MAX_BATCH = 20;

async function flush(): Promise<void> {
  if (flushing) return;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (queue.length === 0) return;
  flushing = true;
  // Make sure the device id is resolved (and claimed server-side) before
  // flushing so events get attributed to this device.
  let deviceId: string | null = null;
  try {
    deviceId = await initDeviceId();
    await claimSession();
  } catch {
    // ignore
  }
  if (!deviceId) { flushing = false; scheduleFlush(15_000); return; }
  // Stamp the real app version at send time: events queued during cold start
  // would otherwise keep the '1.0.0' fallback from before the native version
  // finished resolving.
  await appVersionReady;
  const appVersion = getAppVersion();
  const batch = queue.slice(0, MAX_BATCH);
  let failed = false;
  try {
    // Server-side RPC stamps device_id/auth_user_id itself; client-supplied
    // identity fields are ignored.
    const { error } = await supabase.rpc('log_analytics_events' as any, {
      p_device_id: deviceId,
      p_events: batch.map((e) => ({
        event_name: e.event_name,
        session_id: e.session_id,
        game_id: e.game_id,
        game_mode: e.game_mode,
        metadata: e.metadata,
        platform: e.platform,
        app_version: appVersion,
      })),
    });
    failed = !!error;
  } catch {
    failed = true;
    // Swallow — never crash the app due to analytics.
  }
  queue.splice(0, batch.length);
  // Preserve diagnostic evidence through temporary offline periods/restarts.
  // Retries keep event_id so analysis can deduplicate ambiguous deliveries.
  if (failed) queue.unshift(...batch.filter(isDiagnostic));
  persistDiagnostics();
  flushing = false;
  if (queue.length > 0) scheduleFlush(failed ? 15_000 : FLUSH_DELAY_MS);
}

function scheduleFlush(delay = FLUSH_DELAY_MS): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    void flush();
  }, delay);
}

interface TrackOptions {
  gameId?: string | null;
  gameMode?: string | null;
}

export function trackEvent(
  eventName: AnalyticsEvent | string,
  metadata?: Record<string, unknown>,
  options?: TrackOptions,
): void {
  // Happy moments (own Yatzy or a win) unlock the rating prompt.
  if (eventName === 'yatzy_scored' || (eventName === 'game_finished' && metadata?.won === true)) {
    markHappyMoment();
  }
  try {
    const deviceId = getDeviceIdSync();
    queue.push({
      event_name: eventName,
      session_id: getCurrentSessionId(),
      device_id: deviceId,
      auth_user_id: getAuthUserId(),
      // Mirror device id into the legacy column so historical aggregates
      // keep working until we fully retire `local_user_id`.
      local_user_id: deviceId,
      game_id: options?.gameId ?? null,
      game_mode: options?.gameMode ?? null,
      metadata: eventName === 'post_match_exit' ? { ...metadata, event_id: crypto.randomUUID(), occurred_at: new Date().toISOString() } : metadata ?? null,
      platform: getPlatform(),
      app_version: getAppVersion(),
    });
    if (eventName.startsWith('play_') || eventName === 'post_match_exit') persistDiagnostics();
    if (queue.length >= MAX_BATCH) {
      void flush();
    } else {
      scheduleFlush();
    }
  } catch {
    // Never throw.
  }
}

if (queue.length) scheduleFlush();

// Flush on page hide so we don't lose tail events.
// Guard against double-registration: React Strict Mode (dev) double-mounts
// modules under HMR can otherwise attach the same listeners twice and cause
// duplicate batch inserts.
declare global {
  // eslint-disable-next-line no-var
  var __lovableAnalyticsListenersAttached: boolean | undefined;
}
if (typeof window !== 'undefined' && !globalThis.__lovableAnalyticsListenersAttached) {
  globalThis.__lovableAnalyticsListenersAttached = true;
  const handleHide = () => { void flush(); };
  window.addEventListener('pagehide', handleHide);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush();
  });
}
