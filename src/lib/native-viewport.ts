import { Capacitor } from '@capacitor/core';

const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isNativeIos = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';

export function installNativeViewportSync() {
  const root = document.documentElement;
  const applyPlatformClasses = () => {
    const isNative = Capacitor.isNativePlatform();
    const isNativeIosRuntime = isNative && Capacitor.getPlatform() === 'ios';
    const shouldUseIosViewport = isIos || isNativeIosRuntime;
    root.classList.toggle('capacitor-native', isNative);
    root.classList.toggle('ios-viewport', shouldUseIosViewport);

    if (shouldUseIosViewport) {
      root.classList.add('ios-viewport-debug-detected');
      console.info('[ios-viewport-debug]', {
        iosViewport: root.classList.contains('ios-viewport'),
        capacitorNative: isNative,
        capacitorPlatform: Capacitor.getPlatform(),
        windowInnerHeight: window.innerHeight,
        visualViewportHeight: window.visualViewport?.height ?? null,
        rootClasses: root.className,
        userAgent: navigator.userAgent,
      });
    }
  };

  applyPlatformClasses();
  window.addEventListener('DOMContentLoaded', applyPlatformClasses, { once: true });
  window.setTimeout(applyPlatformClasses, 250);
  window.setTimeout(applyPlatformClasses, 1000);

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
