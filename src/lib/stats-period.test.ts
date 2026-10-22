import { describe, expect, it } from 'vitest';
import { getStatsPeriod } from './stats-period';

describe('Stockholm statistics periods', () => {
  it('starts 2027 at Swedish midnight, before UTC midnight', () => {
    expect(getStatsPeriod('sv', new Date('2026-12-31T23:00:00Z'))).toEqual({ year: 2027, monthName: 'januari' });
    expect(getStatsPeriod('en', new Date('2026-12-31T22:59:59Z'))).toEqual({ year: 2026, monthName: 'December' });
  });
  it('starts a summer month at Swedish midnight with daylight saving time', () => {
    expect(getStatsPeriod('sv', new Date('2026-06-30T22:00:00Z'))).toEqual({ year: 2026, monthName: 'juli' });
    expect(getStatsPeriod('sv', new Date('2026-06-30T21:59:59Z')).monthName).toBe('juni');
  });
});