// Context-aware notification asks: shown at the moment a notification is
// clearly useful (after inviting a friend, while waiting for your turn in a
// friend match), plus a way back to the phone's settings for players who
// already said no to Apple's/Android's permission sheet.

import { Capacitor } from '@capacitor/core';
import { getPushPermissionState } from '@/lib/notifications';
import { trackEvent } from '@/lib/analytics';

export type NotifAskContext = 'invite' | 'turn' | 'first_match';

const LAST_KEY = 'mrb_notif_ctx_ask_v1:'; // + context → timestamp
const TOTAL_KEY = 'mrb_notif_ctx_ask_total_v1';
const COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // per context
const MAX_TOTAL = 6;
let shownThisSession = false;

export interface NotifAskDetail { context: NotifAskContext; name?: string }

/** Shows our soft prompt for this context when it makes sense. Never blocks. */
export async function askNotificationsFor(context: Exclude<NotifAskContext, 'first_match'>, name?: string): Promise<void> {
  try {
    if (shownThisSession) return;
    const total = parseInt(localStorage.getItem(TOTAL_KEY) || '0', 10) || 0;
    if (total >= MAX_TOTAL) return;
    const last = parseInt(localStorage.getItem(LAST_KEY + context) || '0', 10) || 0;
    if (Date.now() - last < COOLDOWN_MS) return;
    if ((await getPushPermissionState()) !== 'prompt') return;
    shownThisSession = true;
    localStorage.setItem(LAST_KEY + context, String(Date.now()));
    localStorage.setItem(TOTAL_KEY, String(total + 1));
    trackEvent('notif_ask_shown', { context });
    window.dispatchEvent(new CustomEvent<NotifAskDetail>('app:notif-ask', { detail: { context, name } }));
  } catch { /* never break the caller */ }
}

/** Opens this app's page in the phone's settings so a "no" can be changed. */
export async function openAppNotificationSettings(): Promise<void> {
  trackEvent('notif_open_settings');
  try {
    const { NativeSettings, IOSSettings, AndroidSettings } = await import('capacitor-native-settings');
    if (Capacitor.getPlatform() === 'android') {
      await NativeSettings.openAndroid({ option: AndroidSettings.AppNotification });
    } else {
      await NativeSettings.openIOS({ option: IOSSettings.App });
    }
  } catch (err) {
    console.warn('[notif] open settings failed', err);
  }
}
