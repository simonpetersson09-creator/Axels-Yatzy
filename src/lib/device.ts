// Stable anonymous device id + per-app-session id for analytics.
//
// - device_id: persists for the lifetime of the install. Stored in
//   Capacitor Preferences on native (survives webview cache wipes) and
//   mirrored to localStorage on web. Same id is reused across sessions.
// - analytics_session_id: new UUID per app launch (in-memory only).
// - auth_user_id: reserved for future logged-in users; never replaces
//   device_id, only added alongside it.

import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const DEVICE_KEY = 'yatzy_device_id';

let cachedDeviceId: string | null = null;
let initPromise: Promise<string> | null = null;
let authUserId: string | null = null;

// One per app launch. Generated synchronously at import time.
const ANALYTICS_SESSION_ID =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function readLocal(): string | null {
  try {
    return localStorage.getItem(DEVICE_KEY);
  } catch {
    return null;
  }
}
function writeLocal(id: string): void {
  try {
    localStorage.setItem(DEVICE_KEY, id);
  } catch {
    // ignore
  }
}

async function loadDeviceId(): Promise<string> {
  // Prefer native Preferences when available, fall back to localStorage.
  let id: string | null = null;
  try {
    if (Capacitor.isNativePlatform()) {
      const { value } = await Preferences.get({ key: DEVICE_KEY });
      id = value ?? null;
    }
  } catch {
    // ignore native errors, fall through to localStorage
  }
  if (!id) id = readLocal();
  if (!id) {
    id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  // Persist in both stores so we survive either being cleared.
  writeLocal(id);
  try {
    if (Capacitor.isNativePlatform()) {
      await Preferences.set({ key: DEVICE_KEY, value: id });
    }
  } catch {
    // ignore
  }
  cachedDeviceId = id;
  return id;
}

/** Kick off device-id resolution at app start. Safe to call many times. */
export function initDeviceId(): Promise<string> {
  if (!initPromise) initPromise = loadDeviceId();
  return initPromise;
}

/**
 * Synchronous accessor for use inside `trackEvent`. Returns the cached
 * device id if known, otherwise falls back to localStorage so we never
 * lose an event during the brief async init window.
 */
export function getDeviceIdSync(): string | null {
  if (cachedDeviceId) return cachedDeviceId;
  const local = readLocal();
  if (local) cachedDeviceId = local;
  return cachedDeviceId;
}

export function getAnalyticsSessionId(): string {
  return ANALYTICS_SESSION_ID;
}

/** Reserved for future authenticated flows; never replaces the device id. */
export function setAuthUserId(id: string | null): void {
  authUserId = id;
}
export function getAuthUserId(): string | null {
  return authUserId;
}
