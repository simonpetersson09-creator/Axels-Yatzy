// Silent, fire-and-forget analytics. Never throws. Never blocks UI.
import { supabase } from '@/integrations/supabase/client';
import {
  getAuthUserId,
  getDeviceIdSync,
  initDeviceId,
} from '@/lib/device';
import { getCurrentSessionId } from '@/lib/analytics-session';

const APP_VERSION = '1.0.0';

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
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
    if (/Android/i.test(ua)) return 'android';
    return 'web';
  } catch {
    return 'unknown';
  }
}

const queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_DELAY_MS = 1500;
const MAX_BATCH = 20;

async function flush(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (queue.length === 0) return;
  // Make sure the device id is resolved (and claimed server-side) before
  // flushing so events get attributed to this device.
  let deviceId: string | null = null;
  try {
    deviceId = await initDeviceId();
    await claimSession();
  } catch {
    // ignore
  }
  if (!deviceId) return;
  const batch = queue.splice(0, MAX_BATCH);
  try {
    // Server-side RPC stamps device_id/auth_user_id itself; client-supplied
    // identity fields are ignored.
    await supabase.rpc('log_analytics_events' as any, {
      p_device_id: deviceId,
      p_events: batch.map((e) => ({
        event_name: e.event_name,
        session_id: e.session_id,
        game_id: e.game_id,
        game_mode: e.game_mode,
        metadata: e.metadata,
        platform: e.platform,
        app_version: e.app_version,
      })),
    });
  } catch {
    // Swallow — never crash the app due to analytics.
  }
  if (queue.length > 0) scheduleFlush();
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    void flush();
  }, FLUSH_DELAY_MS);
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
      metadata: metadata ?? null,
      platform: getPlatform(),
      app_version: APP_VERSION,
    });
    if (queue.length >= MAX_BATCH) {
      void flush();
    } else {
      scheduleFlush();
    }
  } catch {
    // Never throw.
  }
}

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
