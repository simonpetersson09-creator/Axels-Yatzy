import { supabase } from '@/integrations/supabase/client';
import { requireClaimedDevice } from '@/lib/session';
import { t } from '@/lib/i18n';
import { trackEvent } from '@/lib/analytics';
import { rollTiming } from '@/lib/roll-timing';

/** Both the direct and function paths wait for a confirmed device binding. */
export async function directRpc(
  rpc: 'client_roll' | 'client_set_locks' | 'client_set_locks_guarded' | 'client_submit_score' | 'client_start_game',
  _fallbackFn: string,
  args: Record<string, unknown>,
  _fallbackBody: Record<string, unknown>,
  diagnostic?: { attemptId: string; timeoutAfterMs?: number },
): Promise<{ data: any; error: any }> {
  const started = performance.now();
  let requested: number | null = null;
  const attemptId = diagnostic?.attemptId ?? crypto.randomUUID();
  const record = (ok: boolean, serverMs?: unknown, stage: 'response' | 'deadline' = 'response', responseReceived = false) => {
    const ended = performance.now();
    if (!['client_roll', 'client_set_locks_guarded'].includes(rpc) || (ok && ended - started <= 3000)) return;
    try {
      trackEvent(rpc === 'client_roll' ? 'play_roll_timing' : 'play_lock_timing', {
        event_id: crypto.randomUUID(), attempt_id: attemptId,
        occurred_at: new Date().toISOString(), ok, stage,
        response_received: responseReceived,
        request_dispatched: requested !== null,
        ...rollTiming(ended - started, (requested ?? ended) - started, requested === null ? 0 : ended - requested, serverMs),
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
  requested = performance.now();
  let response;
  try { response = await (supabase.rpc as any)(rpc, { ...args, p_device_id: deviceId }); }
  catch (error) { record(false); throw error; }
  const { data, error } = response;
  const result = data as { success?: boolean; error?: string; server_ms?: number; stale_command?: boolean } | null;
  record(!error && result?.success === true, result?.server_ms, 'response', true);
  if (error) return { data: null, error };
  if (!result?.success) return { data: result?.stale_command ? result : null, error: new Error(result?.error ?? 'rpc failed') };
  return { data: result, error: null };
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

export async function invokeDeviceAction(name: string, body: Record<string, unknown>) {
  const deviceId = await requireClaimedDevice();
  return supabase.functions.invoke(name, { body: { ...body, device_id: deviceId } });
}