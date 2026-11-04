import { expect, it, vi } from 'vitest';
const analytics = vi.hoisted(() => ({ trackEvent: vi.fn() }));
vi.mock('./analytics', () => analytics);
import { recordAdLoadDiagnostic } from './ad-load-diagnostics';
it('keeps only technical error and aggregate response fields', () => {
  recordAdLoadDiagnostic({ kind: 'banner', stage: 'load_failed', error_domain: 'com.google.admob', error_code: 1,
    response_info_available: true, adapter_count: 2, adapter_latency_ms: 350,
    message: 'private', response_id: 'private', consent: 'private', networkName: 'private' });
  expect(analytics.trackEvent).toHaveBeenLastCalledWith('ad_load_diagnostic', {
    kind: 'banner', stage: 'load_failed', error_domain: 'com.google.admob', error_code: 1,
    response_info_available: true, adapter_count: 2, adapter_latency_ms: 350 });
});
it('rejects arbitrary domains, nonnumeric values and out-of-range fields', () => {
  recordAdLoadDiagnostic({ kind: 'interstitial', stage: 'load_failed', error_domain: 'private', error_code: '1', adapter_count: -1, adapter_latency_ms: Infinity });
  expect(analytics.trackEvent).toHaveBeenLastCalledWith('ad_load_diagnostic', { kind: 'interstitial', stage: 'load_failed', error_domain: 'other' });
});
it('ignores non-ad failures such as consent', () => {
  analytics.trackEvent.mockClear();
  recordAdLoadDiagnostic({ kind: 'consent', stage: 'load_failed' });
  recordAdLoadDiagnostic({ kind: 'banner', stage: 'consent_failed' });
  expect(analytics.trackEvent).not.toHaveBeenCalled();
});