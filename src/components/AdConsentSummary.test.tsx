import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readAdConsentChoices } from '@/lib/ad-consent';
import { AdConsentSummary } from './AdConsentSummary';

vi.mock('@/lib/i18n', () => ({ t: (key: string) => key }));
afterEach(cleanup);

describe('saved ad choice visibility', () => {
  it('hides the entire US summary when all three choices are unknown', () => {
    const { container } = render(<AdConsentSummary choices={readAdConsentChoices('NOT_REQUIRED', undefined)} />);
    expect(container.childElementCount).toBe(0);
    expect(screen.queryAllByRole('term')).toHaveLength(0);
  });

  it('shows all three saved EU choices, including rejected choices', () => {
    render(<AdConsentSummary choices={readAdConsentChoices('OBTAINED', '1101')} />);
    expect(screen.getAllByRole('term')).toHaveLength(3);
    expect(screen.getAllByRole('definition').map(row => row.textContent)).toEqual([
      'adPrivacyAllowed', 'adPrivacyDenied', 'adPrivacyAllowed',
    ]);
  });

  it('hides only the unknown row when other choices are known', () => {
    render(<AdConsentSummary choices={{ storage: 'allowed', adProfile: 'unknown', useAdProfile: 'denied' }} />);
    expect(screen.getAllByRole('term')).toHaveLength(2);
    expect(screen.getAllByRole('definition').map(row => row.textContent)).toEqual([
      'adPrivacyAllowed', 'adPrivacyDenied',
    ]);
  });
});