// Notification client: registers push tokens, schedules local fallbacks,
// and reads/writes user preferences. Safe on web (no-ops gracefully).

import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getDeviceIdSync, initDeviceId } from '@/lib/device';
import { getSessionId } from '@/lib/session';
import { trackEvent } from '@/lib/analytics';

const PREFS_KEY = 'yatzy_notif_prefs_v1';

// Track which notifications we've already surfaced so the foreground toast
// and the tap-handler never double-fire for the same payload.
const handledNotificationIds = new Set<string>();
function markHandled(id: string | undefined): boolean {
  if (!id) return false;
  if (handledNotificationIds.has(id)) return true;
  handledNotificationIds.add(id);
  // Cap memory — keep last ~200 ids.
  if (handledNotificationIds.size > 200) {
    const first = handledNotificationIds.values().next().value;
    if (first) handledNotificationIds.delete(first);
  }
  return false;
}

export interface NotificationPrefs {
  turnNotifications: boolean;
  reminderNotifications: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = {
  turnNotifications: true,
  reminderNotifications: true,
};

export function getNotificationPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function setNotificationPrefs(prefs: NotificationPrefs): Promise<void> {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
  const deviceId = await initDeviceId();
  try {
    await supabase.functions.invoke('notifications-write', {
      body: {
        action: 'set_prefs',
        device_id: deviceId,
        turn_notifications: prefs.turnNotifications,
        reminder_notifications: prefs.reminderNotifications,
      },
    });
  } catch (err) {
    console.warn('[notifications] failed to sync prefs', err);
  }
  trackEvent('notification_preferences_changed', { ...prefs });
}

let initialized = false;

export async function initNotifications(): Promise<void> {
  if (initialized) return;
  initialized = true;

  // Sync persisted prefs to server (in case the device was offline before)
  const prefs = getNotificationPrefs();
  void setNotificationPrefs(prefs);

  if (!Capacitor.isNativePlatform()) return;

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    // Diagnostic: detect when register() silently never produces a callback
    // (classic symptom of AppDelegate.swift missing the APNs forwarding).
    let registrationCallbackFired = false;

    // CRITICAL: attach listeners BEFORE register() — otherwise the 'registration'
    // event can fire before the listener is attached and the token is lost silently.
    PushNotifications.addListener('registration', async (token) => {
      registrationCallbackFired = true;
      try {
        const deviceId = await initDeviceId();
        const { error } = await supabase.functions.invoke('notifications-write', {
          body: {
            action: 'register_token',
            device_id: deviceId,
            session_id: getSessionId(),
            platform: Capacitor.getPlatform(),
            token: token.value,
          },
        });
        if (error) {
          console.warn('[notifications] register push_token error', error);
          trackEvent('push_token_save_failed', { error: error.message });
        } else {
          trackEvent('push_token_registered', { platform: Capacitor.getPlatform() });
        }
      } catch (err) {
        console.warn('[notifications] failed to save push token', err);
        trackEvent('push_token_save_failed', { error: String(err) });
      }
    });

    PushNotifications.addListener('registrationError', (err) => {
      registrationCallbackFired = true;
      console.warn('[notifications] registration error', err);
      trackEvent('push_registration_error', { error: JSON.stringify(err) });
    });

    // Foreground delivery: iOS does NOT show a banner automatically while the
    // app is open, so surface an in-app toast that the user can tap to jump
    // into the matching game.
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      const data = (notification.data ?? {}) as Record<string, string | undefined>;
      const notifId = data.notification_id;
      // Dedupe vs tap-handler (which fires markHandled too).
      if (markHandled(notifId)) return;

      const kind = data.kind ?? 'turn';
      const gameId = data.game_id;
      const title = notification.title?.trim() || (kind === 'reminder' ? 'Påminnelse' : 'Det är din tur');
      const body = notification.body?.trim() || '';

      trackEvent('push_notification_received_foreground', { kind, game_id: gameId });

      const showToast = kind === 'reminder' ? toast.message : toast;
      showToast(title, {
        description: body || undefined,
        action: gameId
          ? {
              label: 'Öppna',
              onClick: () => {
                trackEvent(kind === 'reminder' ? 'reminder_notification_opened' : 'turn_notification_opened', { game_id: gameId, source: 'foreground_toast' });
                window.dispatchEvent(new CustomEvent('app:navigate', { detail: { path: `/multiplayer-game?gameId=${gameId}` } }));
              },
            }
          : undefined,
      });
    });

    PushNotifications.addListener('pushNotificationActionPerformed', async (action) => {
      const data = action.notification?.data ?? {};
      const kind = (data.kind as string | undefined) ?? 'turn';
      const notifId = data.notification_id as string | undefined;
      // Mark handled so a racing foreground-receive doesn't also toast.
      markHandled(notifId);
      trackEvent(kind === 'reminder' ? 'reminder_notification_opened' : 'turn_notification_opened', { game_id: data.game_id, source: 'tap' });
      if (notifId) {
        try {
          const deviceId = await initDeviceId();
          await supabase.functions.invoke('notifications-write', {
            body: { action: 'mark_opened', notification_id: notifId, device_id: deviceId },
          });
        } catch {
          /* ignore */
        }
      }
      if (data.game_id && typeof window !== 'undefined') {
        // Defer navigation to next tick so app is mounted
        setTimeout(() => {
          window.location.href = `/multiplayer-game?gameId=${data.game_id}`;
        }, 200);
      }
    });

    const perm = await PushNotifications.checkPermissions();
    let granted = perm.receive === 'granted';
    if (!granted) {
      const req = await PushNotifications.requestPermissions();
      granted = req.receive === 'granted';
      trackEvent(granted ? 'notification_permission_granted' : 'notification_permission_denied');
    }
    if (!granted) return;

    await PushNotifications.register();
    trackEvent('push_register_called');

    // If neither 'registration' nor 'registrationError' fires within 15s,
    // APNs callbacks are not reaching the plugin — almost always means
    // AppDelegate.swift lacks the capacitorDidRegisterForRemoteNotifications
    // forwarding, or the binary lacks the aps-environment entitlement.
    setTimeout(() => {
      if (!registrationCallbackFired) {
        console.warn('[notifications] no registration callback within 15s');
        trackEvent('push_registration_timeout');
      }
    }, 15_000);
  } catch (err) {
    console.warn('[notifications] init failed', err);
  }
}

/** Ask the server to send a test notification to this device. Returns diagnostic info. */
export async function sendTestNotification(): Promise<{ ok: boolean; info: unknown }> {
  try {
    const deviceId = getDeviceIdSync();
    const { data, error } = await supabase.functions.invoke('notify-test', {
      body: { device_id: deviceId },
    });
    if (error) return { ok: false, info: { error: error.message } };
    return { ok: !!(data as { delivered?: boolean })?.delivered, info: data };
  } catch (err) {
    return { ok: false, info: { error: String(err) } };
  }
}
