import { describe, expect, it } from 'vitest';
import { readAdConsentChoices } from './ad-consent';
describe('saved UMP purpose choices', () => {
  it('reads previous acceptance', () => {
    expect(readAdConsentChoices('OBTAINED', '11111111111')).toEqual({ storage: 'allowed', adProfile: 'allowed', useAdProfile: 'allowed' });
  });
  it('does not mistake an answered form for acceptance', () => {
    expect(readAdConsentChoices('OBTAINED', '00000000000')).toEqual({ storage: 'denied', adProfile: 'denied', useAdProfile: 'denied' });
  });
  it('keeps custom choices separate', () => {
    expect(readAdConsentChoices('OBTAINED', '11010000000')).toEqual({ storage: 'allowed', adProfile: 'denied', useAdProfile: 'allowed' });
  });
  it('does not infer acceptance from ads being requestable', () => {
    expect(readAdConsentChoices({ canRequestAds: true }, '1111').storage).toBe('unknown');
  });
  it('does not show stale or missing consent as rejection', () => {
    for (const [status, bits] of [['REQUIRED', '1111'], ['NOT_REQUIRED', '1111'], ['OBTAINED', null], ['OBTAINED', 'bad'], ['OBTAINED', '1']]) {
      expect(readAdConsentChoices(status, bits)).toEqual({ storage: 'unknown', adProfile: 'unknown', useAdProfile: 'unknown' });
    }
  });
});