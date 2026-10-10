import { Capacitor } from '@capacitor/core';

/** Central store configuration. Edit here only. */
export const APP_STORE_URL = 'https://apps.apple.com/se/app/mr-b-yatzy/id6767460412';

/** Android package name (same as the Capacitor appId). */
export const ANDROID_PACKAGE_ID = 'com.simonpetersson.axelsyatzy';

/**
 * Google Play listing. Set PLAY_STORE_LIVE to true once the app is published
 * on Google Play; until then no Google Play link is shown anywhere.
 */
export const PLAY_STORE_LIVE = true;
export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE_ID}`;

/** Public web address used in shared invite links (works for people without the app). */
export const PUBLIC_WEB_ORIGIN = 'https://roll-and-score-pro.lovable.app';

export type StoreLink = { store: 'apple' | 'google'; url: string };

function isAndroidDevice(): boolean {
  if (Capacitor.getPlatform() === 'android') return true;
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
}

/**
 * Store links to show, best match first: the native app's own store, or on
 * the web both stores (Google Play first on Android phones).
 */
export function getStoreLinks(): StoreLink[] {
  const apple: StoreLink = { store: 'apple', url: APP_STORE_URL };
  const google: StoreLink | null = PLAY_STORE_LIVE ? { store: 'google', url: PLAY_STORE_URL } : null;
  const platform = Capacitor.getPlatform();
  if (platform === 'ios') return [apple];
  if (platform === 'android') return google ? [google] : [];
  if (!google) return [apple];
  return isAndroidDevice() ? [google, apple] : [apple, google];
}
