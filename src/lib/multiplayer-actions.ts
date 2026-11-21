import { supabase } from '@/integrations/supabase/client';
import { requireClaimedDevice } from '@/lib/session';
import { t } from '@/lib/i18n';
import { trackEvent } from '@/lib/analytics';
import { rollTiming, databaseTiming } from '@/lib/roll-timing';
import { observedRpc, type ObservedHeaders } from '@/lib/observed-rpc';

const TIMED_RPCS = new Set(['client_roll', 'client_set_locks_guarded', 'client_submit_score']);
const SLOW_MS = 3000;
/** Per app session ceiling for timing events (slow calls and failures only). */
export const TIMING_EVENT_BUDGET = 40;
let timingEventsUsed = 0;
function takeTimingBudget() {
  if (timingEventsUsed >= TIMING_EVENT_BUDGET) return false;
  timingEventsUsed++;
  return true;
}
/** Test-only reset of the session ceiling. */
export function resetTimingBudgetForTests() { timingEventsUsed = 0; }

export type TimingOutcome =
  | 'rpc_result' | 'rpc_rejected' | 'http_error' | 'transport_error' | 'body_error'
  | 'claim_failed' | 'client_error' | 'deadline';

/** Headers received ≠ result: classify what actually reached the game. */
export function classifyOutcome(
  error: unknown,
  result: { success?: boolean } | null,
  transportError: string | null,
  bodyError: string | null,
  headers: ObservedHeaders | null,
): TimingOutcome {
  if (transportError !== null) return 'transport_error';
  if (bodyError !== null) return 'body_error';
  if (headers && (headers.status < 200 || headers.status >= 300)) return 'http_error';
  if (error) return headers ? 'http_error' : 'client_error';
  return result?.success === true ? 'rpc_result' : 'rpc_rejected';
}

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
  let bodyRead: number | null = null;
  let transport: ObservedHeaders | null = null;
  let bodyBytes: number | null = null;
  let transportErrorName: string | null = null;
  let bodyErrorName: string | null = null;
  let databaseResult: unknown;
  let events = 0;
  const visibilityAtStart = document.visibilityState;
  const onlineAtStart = navigator.onLine;
  let visibilityChanges = 0;
  let networkChanges = 0;
  const changed = () => { visibilityChanges++; };
  const networkChanged = () => { networkChanges++; };
  document.addEventListener('visibilitychange', changed);
  window.addEventListener('online', networkChanged);
  window.addEventListener('offline', networkChanged);
  const attemptId = diagnostic?.attemptId ?? crypto.randomUUID();
  const phase = () => requested === null ? 'before_dispatch'
    : transportErrorName !== null ? 'transport_failed'
    : headersReceived === null ? 'awaiting_headers'
    : bodyErrorName !== null ? 'body_failed'
    : bodyRead === null ? 'awaiting_body' : 'body_complete';
  const record = (outcome: TimingOutcome, serverMs?: unknown) => {
    const ended = performance.now();
    const ok = outcome === 'rpc_result';
    const stage = outcome === 'deadline' ? 'deadline' : 'response';
    if (!TIMED_RPCS.has(rpc) || (ok && ended - started <= SLOW_MS)) return;
    // At most the deadline observation plus one final result per attempt,
    // and a per-session ceiling, so a bad network cannot flood diagnostics.
    if (events >= 2 || !takeTimingBudget()) return;
    events++;
    try {
      trackEvent(rpc === 'client_roll' ? 'play_roll_timing' : rpc === 'client_submit_score' ? 'play_score_timing' : 'play_lock_timing', {
        event_id: crypto.randomUUID(), attempt_id: attemptId,
        occurred_at: new Date().toISOString(), ok, stage, outcome,
        phase_at_event: phase(),
        response_received: headersReceived !== null,
        request_dispatched: requested !== null,
        timing_version: 3,
        dispatch_boundary: 'fetch_entry',
        client_prepare_ms: Math.round(claimEnded === null ? 0 : (requested ?? ended) - claimEnded),
        pre_dispatch_ms: Math.round((requested ?? ended) - started),
        requested_at: requestedAt,
        response_at: stage === 'response' && headersReceived !== null ? new Date().toISOString() : null,
        fetch_to_headers_ms: requested !== null && headersReceived !== null ? Math.round(headersReceived - requested) : null,
        // Headers → fully read body (transport only; excludes JSON parsing).
        headers_to_body_ms: headersReceived !== null && bodyRead !== null ? Math.round(bodyRead - headersReceived) : null,
        // Headers → RPC result handed to the game (body + parsing), final events only.
        headers_to_response_ms: stage === 'response' && headersReceived !== null ? Math.round(ended - headersReceived) : null,
        waiting_since_dispatch_ms: requested !== null ? Math.round(ended - requested) : null,
        http_status: transport?.status ?? null,
        server_date: transport?.serverDate ?? null,
        gateway_request_id: transport?.gatewayRequestId ?? null,
        gateway_request_id_readable: transport ? transport.gatewayRequestId !== null : null,
        body_bytes: bodyBytes,
        transport_error: transportErrorName,
        body_error: bodyErrorName,
        visibility_at_start: visibilityAtStart,
        visibility_at_end: document.visibilityState,
        visibility_changes: visibilityChanges,
        online_hint: navigator.onLine,
        online_at_start: onlineAtStart,
        network_changes: networkChanges,
        ...rollTiming(ended - started, (claimEnded ?? ended) - started, requested === null ? 0 : ended - requested, serverMs),
        ...databaseTiming(requested === null ? 0 : ended - requested, databaseResult),
      }, { gameId: typeof args.p_game_id === 'string' ? args.p_game_id : null, gameMode: 'multiplayer' });
    } catch { /* Diagnostics never affect a roll. */ }
  };
  // Observes the caller's deadline without canceling, repeating or settling
  // the real request. A late response remains independently measurable.
  const timer = diagnostic?.timeoutAfterMs === undefined ? null : setTimeout(
    () => record('deadline'), diagnostic.timeoutAfterMs,
  );
  try {
  let deviceId: string;
  try { deviceId = await requireClaimedDevice(); }
  catch { record('claim_failed'); return { data: null, error: new Error(t('errGeneric')) }; }
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
  }, () => { headersReceived = performance.now(); }, {
    onHeaders: info => { transport = info; },
    onBodyRead: info => { bodyRead = performance.now(); bodyBytes = info.bytes; },
    onBodyError: info => { bodyErrorName = info.errorName; },
    onTransportError: info => { transportErrorName = info.errorName; },
  }); }
  catch (error) { record(transportErrorName !== null ? 'transport_error' : 'client_error'); throw error; }
  const { data, error } = response;
  databaseResult = data;
  const result = data as { success?: boolean; error?: string; server_ms?: number; stale_command?: boolean } | null;
  record(classifyOutcome(error, result, transportErrorName, bodyErrorName, transport), result?.server_ms);
  if (error) return { data: null, error };
  if (!result?.success) return { data: result?.stale_command ? result : null, error: new Error(result?.error ?? 'rpc failed') };
  return { data: result, error: null };
  } finally {
    document.removeEventListener('visibilitychange', changed);
    window.removeEventListener('online', networkChanged);
    window.removeEventListener('offline', networkChanged);
    if (timer !== null) clearTimeout(timer);
  }
}

export async function invokeDeviceAction(name: string, body: Record<string, unknown>) {
  const deviceId = await requireClaimedDevice();
  return supabase.functions.invoke(name, { body: { ...body, device_id: deviceId } });
}