export type ConsentChoice = 'allowed' | 'denied' | 'unknown';
export interface AdConsentChoices {
  storage: ConsentChoice;
  adProfile: ConsentChoice;
  useAdProfile: ConsentChoice;
}
/** OBTAINED means answered, not accepted. Purpose consents aren't vendor consent. */
export function readAdConsentChoices(status: unknown, purposeConsents: unknown): AdConsentChoices {
  const bits = status === 'OBTAINED' && typeof purposeConsents === 'string' && /^[01]{4,}$/.test(purposeConsents) ? purposeConsents : '';
  const choice = (purpose: number): ConsentChoice => {
    const value = bits[purpose - 1];
    return value === '1' ? 'allowed' : value === '0' ? 'denied' : 'unknown';
  };
  return { storage: choice(1), adProfile: choice(3), useAdProfile: choice(4) };
}