import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const admob = readFileSync(resolve(__dirname, 'admob.ts'), 'utf8');

/** After a rewarded ad or the post-match full-screen ad, the start ad stays away this long. */
const SUPPRESS_SECONDS = 60;

describe('App Open suppression after rewarded and post-match ads', () => {
  it('waits 60 seconds', () => {
    expect(admob).toContain(`const APP_OPEN_SUPPRESS_AFTER_REWARDED_MS = ${SUPPRESS_SECONDS}_000;`);
    expect(admob).not.toMatch(/APP_OPEN_SUPPRESS_AFTER_REWARDED_MS\s*=\s*2 \* 60_000/);
  });

  it('keeps the comment in step with the value', () => {
    expect(admob).toContain(`this long (${SUPPRESS_SECONDS} s)`);
    expect(admob).not.toMatch(/Start ad stays away this long after/);
  });

  it('applies the same wait after the rewarded ad and after the post-match ad', () => {
    const uses = admob.match(/suppressAppOpenUntil = Date\.now\(\) \+ APP_OPEN_SUPPRESS_AFTER_REWARDED_MS;/g) ?? [];
    expect(uses.length).toBeGreaterThanOrEqual(2);
    // The post-match full-screen ad sets it too, so a match end cannot be followed straight by a start ad.
    expect(admob).toContain(
      "if (kind === 'postMatch') suppressAppOpenUntil = Date.now() + APP_OPEN_SUPPRESS_AFTER_REWARDED_MS;",
    );
  });

  it('never blocks the start ad with a hardcoded number', () => {
    expect(admob).not.toMatch(/suppressAppOpenUntil = Date\.now\(\) \+ \d/);
    expect(admob).not.toMatch(/suppressAppOpenUntil = Date\.now\(\) \+ 120/);
  });
});
