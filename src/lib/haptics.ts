// Lightweight haptic feedback helper.
// Prefers Capacitor Haptics on native iOS, falls back to navigator.vibrate on web.

import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

let hapticsAvailable: boolean | null = null;

async function checkHaptics() {
  if (hapticsAvailable !== null) return hapticsAvailable;
  try {
    await Haptics.impact({ style: ImpactStyle.Light });
    hapticsAvailable = true;
    return true;
  } catch {
    hapticsAvailable = false;
    return false;
  }
}

/** Short, satisfying "your turn" haptic — native on iOS, silent fallback on web. */
export async function playTurnHaptic() {
  const native = await checkHaptics();
  if (native) {
    try {
      await Haptics.impact({ style: ImpactStyle.Medium });
      return;
    } catch {
      // fall through
    }
  }
  if ('vibrate' in navigator) {
    navigator.vibrate([15, 30, 15]);
  }
}

/** Very light tap for UI interactions (locks, buttons). */
export async function playLightHaptic() {
  const native = await checkHaptics();
  if (native) {
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
      return;
    } catch {
      // fall through
    }
  }
  if ('vibrate' in navigator) {
    navigator.vibrate(5);
  }
}

/** Solid "thud" when dice land after a roll. */
export async function playDiceLandHaptic() {
  const native = await checkHaptics();
  if (native) {
    try {
      await Haptics.impact({ style: ImpactStyle.Heavy });
      return;
    } catch {
      // fall through
    }
  }
  if ('vibrate' in navigator) {
    navigator.vibrate(25);
  }
}

/** Success pulse for scoring a category or hitting Yatzy. */
export async function playSuccessHaptic() {
  const native = await checkHaptics();
  if (native) {
    try {
      await Haptics.notification({ type: NotificationType.Success });
      return;
    } catch {
      // fall through
    }
  }
  if ('vibrate' in navigator) {
    navigator.vibrate([10, 40, 20]);
  }
}
