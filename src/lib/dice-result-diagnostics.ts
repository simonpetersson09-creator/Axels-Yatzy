import { trackEvent } from '@/lib/analytics';

type ResultSource = 'rpc' | 'recovery';
const counts = new Map<string, number>();
const MAX_EVENTS_PER_MATCH = 8;

/** Observe existing boundaries only. No dice, names, network details or retries. */
export function observeDiceResult(gameId: string, attemptId: string) {
  const started = performance.now();
  let received: number | null = null;
  let receivedSource: ResultSource | null = null;
  let closed = false;
  let backgroundSeen = document.visibilityState !== 'visible';
  let offlineSeen = !navigator.onLine;
  let visibilityChanges = 0;
  let connectivityChanges = 0;
  const visibility = () => {
    visibilityChanges++;
    backgroundSeen ||= document.visibilityState !== 'visible';
  };
  const connectivity = () => {
    connectivityChanges++;
    offlineSeen ||= !navigator.onLine;
  };
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('online', connectivity);
  window.addEventListener('offline', connectivity);
  const cancel = () => {
    closed = true;
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('online', connectivity);
    window.removeEventListener('offline', connectivity);
  };
  return {
    cancel,
    received(source: ResultSource) {
      if (closed || received !== null) return;
      received = performance.now();
      receivedSource = source;
    },
    landingSignal(source: ResultSource) {
      if (closed) return;
      const ended = performance.now();
      cancel();
      const elapsed = Math.max(0, Math.round(ended - started));
      // Routine fast direct results stay silent; this is not an admin issue.
      if (elapsed <= 3000 && source === 'rpc' && !backgroundSeen && !offlineSeen
        && visibilityChanges === 0 && connectivityChanges === 0) return;
      const count = counts.get(gameId) ?? 0;
      if (count >= MAX_EVENTS_PER_MATCH) return;
      if (counts.size >= 100 && !counts.has(gameId)) counts.delete(counts.keys().next().value ?? '');
      counts.set(gameId, count + 1);
      try {
        trackEvent('play_dice_result_timing', {
          attempt_id: attemptId,
          result_source: source,
          first_result_source: receivedSource,
          result_received_ms: received === null ? null : Math.max(0, Math.round(received - started)),
          result_to_landing_signal_ms: received === null ? null : Math.max(0, Math.round(ended - received)),
          landing_signal_ms: elapsed,
          // This is the application's land command, not measured GPU frames.
          boundary: 'dice_await_released',
          background_seen: backgroundSeen,
          offline_hint_seen: offlineSeen,
          visibility_changes: visibilityChanges,
          connectivity_changes: connectivityChanges,
          cause_confirmed: false,
        }, { gameId, gameMode: 'multiplayer' });
      } catch { /* Diagnostics must never affect the roll. */ }
    },
  };
}