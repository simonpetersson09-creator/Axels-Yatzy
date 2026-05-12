import { Capacitor } from '@capacitor/core';

const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isNativeIos = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';

export function installNativeViewportSync() {
  const root = document.documentElement;
  const isNative = Capacitor.isNativePlatform();
  const shouldUseIosViewport = isIos || isNativeIos;
  root.classList.toggle('capacitor-native', isNative);
  root.classList.toggle('ios-viewport', shouldUseIosViewport);

  if (shouldUseIosViewport) {
    root.classList.add('ios-viewport-debug-detected');
    console.info('[ios-viewport-debug]', {
      iosViewport: root.classList.contains('ios-viewport'),
      capacitorNative: isNative,
      capacitorPlatform: Capacitor.getPlatform(),
      userAgent: navigator.userAgent,
    });
  }

  let raf = 0;
  const sync = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
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
