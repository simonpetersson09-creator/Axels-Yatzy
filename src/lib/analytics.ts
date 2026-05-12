// Silent, fire-and-forget analytics. Never throws. Never blocks UI.
import { supabase } from '@/integrations/supabase/client';
import { getSessionId } from '@/lib/session';

const LOCAL_USER_KEY = 'yatzy_local_user_id';
const APP_VERSION = '1.0.0';

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
  local_user_id: string | null;
  game_id: string | null;
  game_mode: string | null;
  metadata: Record<string, unknown> | null;
  platform: string;
  app_version: string;
}

function getLocalUserId(): string {
  try {
    let id = localStorage.getItem(LOCAL_USER_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(LOCAL_USER_KEY, id);
    }
    return id;
  } catch {
    return 'anonymous';
  }
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
  const batch = queue.splice(0, MAX_BATCH);
  try {
    await supabase.from('analytics_events').insert(batch);
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
    queue.push({
      event_name: eventName,
      session_id: getSessionId(),
      local_user_id: getLocalUserId(),
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
