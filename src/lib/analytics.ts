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
  // Make sure the device id is resolved before flushing the first batch
  // so events sent during the brief init window get tagged correctly.
  try {
    const id = await initDeviceId();
    for (const ev of queue) {
      if (!ev.device_id) ev.device_id = id;
      if (!ev.local_user_id) ev.local_user_id = id;
    }
  } catch {
    // ignore; device id may stay null for these events
  }
  const batch = queue.splice(0, MAX_BATCH);
  try {
    await supabase.from('analytics_events').insert(batch as any);
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
      session_id: getAnalyticsSessionId(),
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
if (typeof window !== 'undefined') {
  const handleHide = () => { void flush(); };
  window.addEventListener('pagehide', handleHide);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush();
  });
}
