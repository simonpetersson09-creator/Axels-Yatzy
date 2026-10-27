import { describe, expect, it } from 'vitest';
// @ts-ignore plain JS build script (types may or may not resolve)
import { verify } from '../../scripts/verify-admob-patches.js';

describe('verify-admob-patches', () => {
  it('stops the iOS build when the discardPrivacyCaches registration is missing', async () => {
    const missing: string[] = await verify('ios', async () => 'func discardPrivacyCache()');
    expect(missing.some(m => m.includes('registrering av discardPrivacyCaches'))).toBe(true);
    expect(missing.some(m => m.includes('registrering av getStoredConsentChoices'))).toBe(true);
  });
});
