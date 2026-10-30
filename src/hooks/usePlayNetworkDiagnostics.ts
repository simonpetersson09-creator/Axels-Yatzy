import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { trackEvent } from '@/lib/analytics';

// Correlation only: exiting with an issue does not prove why the player left.
export function usePlayNetworkDiagnostics(gameId: string | null, status: string, error: boolean, slow: boolean) {
  const current = useRef({ status, error, slow });
  current.current = { status, error, slow };
  const previous = useRef(false);
  const issueAt = useRef<number | null>(null);
  const log = (event: string, reason: string) => trackEvent(event, {
    event_id: crypto.randomUUID(), occurred_at: new Date().toISOString(), reason,
    status: current.current.status, offline: !navigator.onLine,
    error_visible: current.current.error, slow_response: current.current.slow,
    issue_duration_ms: issueAt.current === null ? 0 : Date.now() - issueAt.current,
    // Never claim causation from correlation.
    cause_confirmed: false,
  }, { gameId, gameMode: 'multiplayer' });

  useEffect(() => {
    previous.current = false;
    issueAt.current = null;
    let backgrounded = false;
    const update = () => {
      const issue = !navigator.onLine || current.current.error || current.current.slow;
      if (issue === previous.current) return;
      if (issue) issueAt.current = Date.now();
      log(issue ? 'play_network_issue' : 'play_network_recovered', !navigator.onLine ? 'offline' : current.current.error ? 'error_visible' : current.current.slow ? 'slow_response' : 'signals_cleared');
      previous.current = issue;
      if (!issue) issueAt.current = null;
    };
    const background = () => {
      if (backgrounded) return;
      backgrounded = true;
      if (current.current.status !== 'finished' && (!navigator.onLine || current.current.error || current.current.slow)) log('play_network_exit', 'background');
    };
    const visibility = () => { if (document.visibilityState === 'hidden') background(); else backgrounded = false; };
    window.addEventListener('offline', update);
    window.addEventListener('online', update);
    window.addEventListener('pagehide', background);
    document.addEventListener('visibilitychange', visibility);
    let disposed = false;
    let removeNative: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) void App.addListener('appStateChange', ({ isActive }) => { if (isActive) backgrounded = false; else background(); }).then(handle => { if (disposed) void handle.remove(); else removeNative = () => { void handle.remove(); }; }).catch(() => {});
    update();
    return () => {
      // Captures home/back/swipe/forfeit navigation, including pointer-only buttons.
      if (!backgrounded && current.current.status !== 'finished' && (!navigator.onLine || current.current.error || current.current.slow)) log('play_network_exit', 'screen_left');
      disposed = true;
      removeNative?.();
      window.removeEventListener('offline', update);
      window.removeEventListener('online', update);
      window.removeEventListener('pagehide', background);
      document.removeEventListener('visibilitychange', visibility);
    };
    // Only membership changes install listeners; current flags live in a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);
  useEffect(() => {
    const issue = !navigator.onLine || error || slow;
    if (issue === previous.current) return;
    if (issue) issueAt.current = Date.now();
    log(issue ? 'play_network_issue' : 'play_network_recovered', error ? 'error_visible' : slow ? 'slow_response' : 'signals_cleared');
    previous.current = issue;
    if (!issue) issueAt.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error, slow]);
}