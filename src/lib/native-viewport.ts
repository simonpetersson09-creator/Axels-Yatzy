import { Capacitor } from '@capacitor/core';

const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isNativeIos = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';

// Lovable/desktop preview: not on a real iOS device and not running in Capacitor.
// In this case we render the app inside a fixed iPhone 15-sized frame (393×852)
// so the layout looks the same as on the real device.
const isPreviewFrame = !Capacitor.isNativePlatform() && !isIos;

const PREVIEW_W = 393;
const PREVIEW_H = 852;

export function installNativeViewportSync() {
  const root = document.documentElement;
  root.classList.toggle('capacitor-native', Capacitor.isNativePlatform());
  root.classList.toggle('ios-viewport', isIos || isNativeIos);
  root.classList.toggle('preview-frame', isPreviewFrame);

  let raf = 0;
  const sync = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      if (isPreviewFrame) {
        // Lock the app's viewport variables to the iPhone 15 frame size,
        // so app-fixed-screen / game-scroll-lock size to the frame, not the window.
        root.style.setProperty('--app-dvh', `${PREVIEW_H}px`);
        root.style.setProperty('--app-vw', `${PREVIEW_W}px`);
        return;
      }
      const viewport = window.visualViewport;
      const height = viewport?.height ?? window.innerHeight;
      const width = viewport?.width ?? window.innerWidth;
      root.style.setProperty('--app-dvh', `${height}px`);
      root.style.setProperty('--app-vw', `${width}px`);
    });
  };

  sync();
  window.addEventListener('resize', sync, { passive: true });
  window.addEventListener('orientationchange', sync, { passive: true });
  window.visualViewport?.addEventListener('resize', sync, { passive: true });
  window.visualViewport?.addEventListener('scroll', sync, { passive: true });
}
