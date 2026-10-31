import { describe, it, expect, vi } from 'vitest';
vi.mock('./analytics', () => ({ trackEvent: vi.fn() }));
import { safeAppOpenDiagnostic } from './app-open-diagnostics';
import { diagnosticRows } from '../../supabase/functions/admin-analytics/diagnostics';

describe('App Open diagnostic privacy and correlation', () => {
  it('retains technical statuses but rejects IDFA, consent strings and free errors', () => {
    expect(safeAppOpenDiagnostic({ stage: 'load_requested', att_status: 'denied', can_request_ads: true,
      idfa: 'private', purposeConsents: '11111', error: 'private', device_id: 'private' }))
      .toEqual({ stage: 'load_requested', att_status: 'denied', can_request_ads: true });
  });
  it('orders the same attempt by native time and deduplicates retries without identities', () => {
    const row = (id: string, ms: number) => ({ created_at: '2026-10-31', app_version: '5.5 (2)',
      metadata: { event_id: id, attempt_id: 'temporary', occurred_at_ms: ms, idfa: 'private' } });
    const rows = diagnosticRows([row('second', 20), row('first', 10), row('first', 10)]);
    expect(rows).toHaveLength(2);
    expect(rows.map(r => (r as Record<string, unknown>).occurred_at_ms)).toEqual([10, 20]);
    expect(JSON.stringify(rows)).not.toContain('private');
  });
  it('retains safe lifecycle fields in client and admin copies', () => {
    const input = { attempt_id: 'temporary', stage: 'load_no_fill', source: 'background', error_domain: 'com.google.admob',
      error_code: 1, cache_age_ms: 500, retry_remaining_ms: 60_000, reason: 'expired', error: 'private' };
    const safe = safeAppOpenDiagnostic(input);
    expect(safe).toEqual({ attempt_id: 'temporary', stage: 'load_no_fill', source: 'background', error_domain: 'com.google.admob',
      error_code: 1, cache_age_ms: 500, retry_remaining_ms: 60_000, reason: 'expired' });
    const rows = diagnosticRows([{ metadata: input, created_at: '2026-10-31', app_version: '5.5' }]);
    expect(rows[0]).toMatchObject(safe);
  });
  it('drops free domains, noninteger codes, arbitrary reasons/sources and nonfinite ages', () => {
    const input = { error_domain: 'private', error_code: 'private', reason: 'private', source: 'private', cache_age_ms: Infinity };
    expect(safeAppOpenDiagnostic(input)).toEqual({});
    expect(JSON.stringify(diagnosticRows([{ metadata: input, created_at: '2026-10-31', app_version: '5.5' }]))).not.toContain('private');
  });
});