import { Capacitor } from '@capacitor/core';

const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Dev-only: ?iosPreview=true forces the real iOS layout inside the
// Lovable/desktop preview. The flag is persisted in sessionStorage so
// it survives client-side navigation. Add ?iosPreview=false to disable.
const IOS_PREVIEW_KEY = 'lovable:iosPreview';
function readIosPreviewFlag(): boolean {
  try {
    const url = new URL(window.location.href);
    const param = url.searchParams.get('iosPreview');
    if (param === 'true' || param === '1') {
      sessionStorage.setItem(IOS_PREVIEW_KEY, '1');
      return true;
    }
    if (param === 'false' || param === '0') {
      sessionStorage.removeItem(IOS_PREVIEW_KEY);
      return false;
    }
    return sessionStorage.getItem(IOS_PREVIEW_KEY) === '1';
  } catch {
    return false;
  }
}

export const isIosPreview = readIosPreviewFlag();

export const isNativeIos =
  (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios') || isIosPreview;

// Lovable/desktop preview: not on a real iOS device and not running in Capacitor.
// In this case we render the app inside a fixed iPhone 15-sized frame (393×852)
// so the layout looks the same as on the real device. Forced when iosPreview=true.
const isPreviewFrame =
  isIosPreview || (!Capacitor.isNativePlatform() && !isIos);

const PREVIEW_W = 393;
const PREVIEW_H = 852;

function mountIosPreviewLabel() {
  if (document.getElementById('ios-preview-label')) return;
  const el = document.createElement('div');
  el.id = 'ios-preview-label';
  el.textContent = 'iOS Preview Mode';
  Object.assign(el.style, {
    position: 'fixed',
    top: '12px',
    left: '12px',
    zIndex: '2147483647',
    padding: '4px 10px',
    fontSize: '11px',
    fontWeight: '600',
    fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
    color: 'hsl(36 78% 55%)',
    background: 'hsl(195 50% 10% / 0.85)',
    border: '1px solid hsl(36 78% 55% / 0.5)',
    borderRadius: '999px',
    pointerEvents: 'none',
    letterSpacing: '0.02em',
    backdropFilter: 'blur(6px)',
  } as Partial<CSSStyleDeclaration>);
  document.body.appendChild(el);
}

export function installNativeViewportSync() {
  const root = document.documentElement;
  root.classList.toggle('capacitor-native', Capacitor.isNativePlatform());
  root.classList.toggle('ios-viewport', isIos || isNativeIos || isIosPreview);
  root.classList.toggle('preview-frame', isPreviewFrame);
  root.classList.toggle('ios-preview', isIosPreview);

  if (isIosPreview) {
    if (document.body) mountIosPreviewLabel();
    else document.addEventListener('DOMContentLoaded', mountIosPreviewLabel, { once: true });
  }

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
