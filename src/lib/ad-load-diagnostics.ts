import { trackEvent } from './analytics';

/** Deliberately excludes SDK response IDs, messages, network names and consent. */
export function recordAdLoadDiagnostic(data: Record<string, unknown>) {
  if (data.kind !== 'banner' && data.kind !== 'interstitial') return;
  if (data.stage !== 'load_failed') return;
  const safe: Record<string, unknown> = { kind: data.kind, stage: data.stage };
  safe.error_domain = data.error_domain === 'com.google.admob' || data.error_domain === 'com.google.android.gms.ads'
    ? data.error_domain : 'other';
  for (const [key, max] of Object.entries({ error_code: 1000, adapter_count: 100, adapter_latency_ms: 3600000 })) {
    const value = data[key];
    if (typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0 && value <= max) safe[key] = value;
  }
  if (typeof data.response_info_available === 'boolean') safe.response_info_available = data.response_info_available;
  try { trackEvent('ad_load_diagnostic', safe); } catch { /* never affects ads */ }
}