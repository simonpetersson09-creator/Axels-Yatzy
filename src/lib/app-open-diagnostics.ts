import { trackEvent } from './analytics';

const fields = ['stage', 'flow_id', 'attempt_id', 'occurred_at_ms', 'att_status', 'ump_status',
  'can_request_ads', 'app_version', 'build_number', 'ad_unit_id', 'test_mode', 'replayed'] as const;
export function safeAppOpenDiagnostic(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(fields.filter(k => typeof input[k] === 'string' || typeof input[k] === 'boolean' ||
    (k === 'occurred_at_ms' && typeof input[k] === 'number')).map(k => [k, typeof input[k] === 'string' ? input[k].slice(0, 100) : input[k]]));
}
export function recordAppOpenDiagnostic(input: Record<string, unknown>): void {
  try { trackEvent('ios_app_open_diag', safeAppOpenDiagnostic(input)); } catch { /* Never gate ads. */ }
}