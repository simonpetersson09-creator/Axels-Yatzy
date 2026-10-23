import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

/** Presentation-only wake; never requests a roll or changes game state. */
export function subscribeDiceResume(wake: () => void): () => void {
  let disposed = false;
  let removeNative: (() => void) | undefined;
  const visible = () => {
    if (!disposed && document.visibilityState === 'visible') wake();
  };
  document.addEventListener('visibilitychange', visible);
  window.addEventListener('pageshow', visible);
  window.addEventListener('focus', visible);
  if (Capacitor.isNativePlatform()) {
    void App.addListener('appStateChange', ({ isActive }) => {
      if (isActive && !disposed) wake();
    }).then((handle) => {
      if (disposed) void handle.remove();
      else removeNative = () => { void handle.remove(); };
    }).catch(() => { /* DOM events still provide a fallback. */ });
  }
  return () => {
    disposed = true;
    document.removeEventListener('visibilitychange', visible);
    window.removeEventListener('pageshow', visible);
    window.removeEventListener('focus', visible);
    removeNative?.();
  };
}