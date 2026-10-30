import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { trackEvent } from '@/lib/analytics';
import { createPlayJourney, playScreenForPath, safePlayAction } from '@/lib/play-journey';

const journey = createPlayJourney((event, metadata) => trackEvent(event, metadata));

export default function PlayJourneyHost() {
  const { pathname } = useLocation();
  useEffect(() => { journey.screen(playScreenForPath(pathname)); }, [pathname]);
  useEffect(() => {
    // Explicit tags identify choices, never collect labels or input values.
    const click = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest('[data-play-action],button,a,[role="button"]') : null;
      if (!target) return;
      const screen = playScreenForPath(window.location.pathname);
      if (!screen) return; // Admin credentials and legal/privacy pages excluded.
      journey.action(safePlayAction(target.getAttribute('data-play-action') ?? undefined) ?? (screen === 'local_game' || screen === 'online_game' ? 'game_control' : 'other_control'));
    };
    const visibility = () => document.visibilityState === 'hidden' ? journey.hide('background') : journey.resume();
    const pagehide = () => journey.hide('pagehide');
    const pageshow = () => journey.resume();
    document.addEventListener('click', click, true);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', pagehide);
    window.addEventListener('pageshow', pageshow);
    let disposed = false;
    let removeNative: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) {
      void App.addListener('appStateChange', ({ isActive }) => isActive ? journey.resume() : journey.hide('background')).then(handle => {
        if (disposed) void handle.remove();
        else removeNative = () => { void handle.remove(); };
      }).catch(() => {});
    }
    return () => {
      disposed = true;
      removeNative?.();
      document.removeEventListener('click', click, true);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', pagehide);
      window.removeEventListener('pageshow', pageshow);
    };
  }, []);
  return null;
}