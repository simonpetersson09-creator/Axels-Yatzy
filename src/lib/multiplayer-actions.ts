import { supabase } from '@/integrations/supabase/client';
import { requireClaimedDevice } from '@/lib/session';
import { t } from '@/lib/i18n';
import { trackEvent } from '@/lib/analytics';
import { rollTiming, databaseTiming } from '@/lib/roll-timing';
import { observedRpc } from '@/lib/observed-rpc';

/** Both the direct and function paths wait for a confirmed device binding. */
export async function directRpc(
  rpc: 'client_roll' | 'client_set_locks' | 'client_set_locks_guarded' | 'client_submit_score' | 'client_start_game',
  _fallbackFn: string,
  args: Record<string, unknown>,
  _fallbackBody: Record<string, unknown>,
  diagnostic?: { attemptId: string; timeoutAfterMs?: number },
): Promise<{ data: any; error: any }> {
  const started = performance.now();
  let claimEnded: number | null = null;
  let requested: number | null = null;
  let requestedAt: string | null = null;
  let headersReceived: number | null = null;
  let databaseResult: unknown;
  const visibilityAtStart = document.visibilityState;
  let visibilityChanges = 0;
  const changed = () => { visibilityChanges++; };
  document.addEventListener('visibilitychange', changed);
  const attemptId = diagnostic?.attemptId ?? crypto.randomUUID();
  const record = (ok: boolean, serverMs?: unknown, stage: 'response' | 'deadline' = 'response', responseReceived = false) => {
    const ended = performance.now();
    if (!['client_roll', 'client_set_locks_guarded', 'client_submit_score'].includes(rpc) || (ok && ended - started <= 3000)) return;
    try {
      trackEvent(rpc === 'client_roll' ? 'play_roll_timing' : rpc === 'client_submit_score' ? 'play_score_timing' : 'play_lock_timing', {
        event_id: crypto.randomUUID(), attempt_id: attemptId,
        occurred_at: new Date().toISOString(), ok, stage,
        response_received: responseReceived,
        request_dispatched: requested !== null,
        timing_version: 3,
        dispatch_boundary: 'fetch_entry',
        client_prepare_ms: Math.round(claimEnded === null ? 0 : (requested ?? ended) - claimEnded),
        pre_dispatch_ms: Math.round((requested ?? ended) - started),
        requested_at: requestedAt,
        response_at: stage === 'response' ? new Date().toISOString() : null,
        fetch_to_headers_ms: requested !== null && headersReceived !== null ? Math.round(headersReceived - requested) : null,
        headers_to_response_ms: stage === 'response' && headersReceived !== null ? Math.round(ended - headersReceived) : null,
        visibility_at_start: visibilityAtStart,
        visibility_at_end: document.visibilityState,
        visibility_changes: visibilityChanges,
        online_hint: navigator.onLine,
        ...rollTiming(ended - started, (claimEnded ?? ended) - started, requested === null ? 0 : ended - requested, serverMs),
        ...databaseTiming(requested === null ? 0 : ended - requested, databaseResult),
      }, { gameId: typeof args.p_game_id === 'string' ? args.p_game_id : null, gameMode: 'multiplayer' });
    } catch { /* Diagnostics never affect a roll. */ }
  };
  // Observes the caller's deadline without canceling, repeating or settling
  // the real request. A late response remains independently measurable.
  const timer = diagnostic?.timeoutAfterMs === undefined ? null : setTimeout(
    () => record(false, undefined, 'deadline'), diagnostic.timeoutAfterMs,
  );
  try {
  let deviceId: string;
  try { deviceId = await requireClaimedDevice(); }
  catch { record(false); return { data: null, error: new Error(t('errGeneric')) }; }
  claimEnded = performance.now();
  let response;
  const measuredRpc = diagnostic && rpc === 'client_roll' ? 'client_roll_diagnosed'
    : diagnostic && rpc === 'client_set_locks_guarded' ? 'client_set_locks_diagnosed'
    : diagnostic && rpc === 'client_submit_score' ? 'client_submit_score_diagnosed' : rpc;
  try { response = await observedRpc(measuredRpc, {
    ...args, p_device_id: deviceId,
    ...(measuredRpc !== rpc ? { p_attempt_id: attemptId } : {}),
  }, () => {
    if (requested !== null) return;
    requested = performance.now();
    requestedAt = new Date().toISOString();
  }, () => { headersReceived = performance.now(); }); }
  catch (error) { record(false); throw error; }
  const { data, error } = response;
  databaseResult = data;
  const result = data as { success?: boolean; error?: string; server_ms?: number; stale_command?: boolean } | null;
  record(!error && result?.success === true, result?.server_ms, 'response', true);
  if (error) return { data: null, error };
  if (!result?.success) return { data: result?.stale_command ? result : null, error: new Error(result?.error ?? 'rpc failed') };
  return { data: result, error: null };
  } finally {
    document.removeEventListener('visibilitychange', changed);
    if (timer !== null) clearTimeout(timer);
  }
}

export async function invokeDeviceAction(name: string, body: Record<string, unknown>) {
  const deviceId = await requireClaimedDevice();
  return supabase.functions.invoke(name, { body: { ...body, device_id: deviceId } });
}