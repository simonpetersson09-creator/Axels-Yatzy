// Notification client: registers push tokens, schedules local fallbacks,
// and reads/writes user preferences. Safe on web (no-ops gracefully).

import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { getDeviceIdSync, initDeviceId } from '@/lib/device';
import { getSessionId } from '@/lib/session';
import { trackEvent } from '@/lib/analytics';

const PREFS_KEY = 'yatzy_notif_prefs_v1';

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
    await supabase.from('notification_preferences').upsert({
      device_id: deviceId,
      turn_notifications: prefs.turnNotifications,
      reminder_notifications: prefs.reminderNotifications,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[notifications] failed to sync prefs', err);
  }
  trackEvent('notification_preferences_changed', prefs);
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

    const perm = await PushNotifications.checkPermissions();
    let granted = perm.receive === 'granted';
    if (!granted) {
      const req = await PushNotifications.requestPermissions();
      granted = req.receive === 'granted';
      trackEvent(granted ? 'notification_permission_granted' : 'notification_permission_denied');
    }
    if (!granted) return;

    await PushNotifications.register();

    PushNotifications.addListener('registration', async (token) => {
      try {
        const deviceId = await initDeviceId();
        await supabase.from('push_tokens').upsert(
          {
            device_id: deviceId,
            session_id: getSessionId(),
            platform: Capacitor.getPlatform(),
            token: token.value,
            enabled: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'device_id,token' },
        );
      } catch (err) {
        console.warn('[notifications] failed to save push token', err);
      }
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.warn('[notifications] registration error', err);
    });

    PushNotifications.addListener('pushNotificationActionPerformed', async (action) => {
      const data = action.notification?.data ?? {};
      const kind = (data.kind as string | undefined) ?? 'turn';
      const notifId = data.notification_id as string | undefined;
      trackEvent(kind === 'reminder' ? 'reminder_notification_opened' : 'turn_notification_opened', { game_id: data.game_id });
      if (notifId) {
        try {
          await supabase
            .from('notification_log')
            .update({ opened_at: new Date().toISOString() })
            .eq('id', notifId);
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
  } catch (err) {
    console.warn('[notifications] init failed', err);
  }
}

/** Fire-and-forget: ask the server to send a turn notification for `gameId`. */
export async function pingTurnChange(gameId: string): Promise<void> {
  try {
    const deviceId = getDeviceIdSync();
    await supabase.functions.invoke('notify-turn-change', {
      body: { game_id: gameId, sender_device_id: deviceId },
    });
  } catch {
    /* never throw — notifications are best-effort */
  }
}
