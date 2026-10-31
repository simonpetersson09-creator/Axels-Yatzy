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
});