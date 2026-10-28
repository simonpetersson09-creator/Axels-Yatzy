import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const home = readFileSync(resolve(__dirname, '../pages/HomePage.tsx'), 'utf8');

/** The player must be away at least this long before a return may show the App Open ad. */
const AWAY_MS = 40_000;

describe('return-away App Open rule', () => {
  it('requires 40 seconds away', () => {
    expect(home).toContain(`const RESUME_AD_MIN_AWAY_MS = ${AWAY_MS};`);
  });

  it('gates the resume ad on that constant, not on a hardcoded number', () => {
    expect(home).toContain('if (away < RESUME_AD_MIN_AWAY_MS) return;');
    expect(home).not.toMatch(/if \(away < \d/);
  });

  it('keeps the comment in step with the value', () => {
    expect(home).toContain(`away ≥ ${AWAY_MS / 1000} s`);
    expect(home).not.toMatch(/away ≥ 60 s/);
  });
});
