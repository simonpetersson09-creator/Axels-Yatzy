import { trackEvent } from './analytics';

const fields = ['stage', 'flow_id', 'attempt_id', 'occurred_at_ms', 'att_status', 'ump_status',
  'can_request_ads', 'app_version', 'build_number', 'ad_unit_id', 'test_mode', 'replayed',
  'source', 'reason', 'error_code', 'error_domain', 'cache_age_ms', 'retry_remaining_ms'] as const;
export function safeAppOpenDiagnostic(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(fields.filter(k => typeof input[k] === 'string' || typeof input[k] === 'boolean' ||
    (['occurred_at_ms', 'error_code', 'cache_age_ms', 'retry_remaining_ms'].includes(k) && typeof input[k] === 'number' && Number.isFinite(input[k])))
    .filter(k => k !== 'error_domain' || ['com.google.admob', 'other'].includes(String(input[k])))
    .map(k => [k, typeof input[k] === 'string' ? input[k].slice(0, 100) : input[k]]));
}
export function recordAppOpenDiagnostic(input: Record<string, unknown>): void {
  try { trackEvent('ios_app_open_diag', safeAppOpenDiagnostic(input)); } catch { /* Never gate ads. */ }
}