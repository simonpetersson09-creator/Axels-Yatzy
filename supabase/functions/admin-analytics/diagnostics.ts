const fields = ['event_id', 'stage', 'flow_id', 'attempt_id', 'occurred_at_ms', 'att_status', 'ump_status',
  'can_request_ads', 'app_version', 'build_number', 'ad_unit_id', 'test_mode', 'replayed',
  'source', 'reason', 'error_code', 'error_domain', 'cache_age_ms', 'retry_remaining_ms'];
export function diagnosticRows(rows: { metadata: Record<string, unknown> | null; created_at: string; app_version: string }[]) {
  const seen = new Set<string>();
  return rows.flatMap(row => {
    const m = row.metadata ?? {};
    const key = typeof m.event_id === 'string' ? m.event_id : JSON.stringify([m.attempt_id, m.stage, m.occurred_at_ms]);
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ received_at: row.created_at, reported_version: row.app_version,
      ...Object.fromEntries(fields.filter(k => ['string', 'boolean', 'number'].includes(typeof m[k]))
        .filter(k => typeof m[k] !== 'number' || Number.isFinite(m[k]))
        .filter(k => k !== 'error_domain' || ['com.google.admob', 'other'].includes(String(m[k])))
        .filter(k => k !== 'error_code' || (typeof m[k] === 'number' && Number.isInteger(m[k])))
        .filter(k => k !== 'source' || ['startup', 'resume', 'background', 'preload', 'after_presentation'].includes(String(m[k])))
        .filter(k => k !== 'reason' || ['privacy_change', 'clock_rollback', 'expired', 'consumed', 'presentation_failed'].includes(String(m[k]))) .map(k =>
        [k, typeof m[k] === 'string' ? m[k].slice(0, 100) : m[k]])) }];
  }).sort((a, b) => String(a['attempt_id' as keyof typeof a] ?? '').localeCompare(String(b['attempt_id' as keyof typeof b] ?? '')) ||
    Number((a as Record<string, unknown>).occurred_at_ms ?? 0) - Number((b as Record<string, unknown>).occurred_at_ms ?? 0));
}