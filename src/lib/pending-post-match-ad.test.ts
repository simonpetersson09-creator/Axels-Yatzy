import { beforeEach, describe, expect, it } from 'vitest';
import { getPendingPostMatchAd, markPendingPostMatchAd, notePendingPostMatchAttempt, settlePostMatchAd } from './pending-post-match-ad';

describe('missed post-match ad', () => {
  beforeEach(() => localStorage.clear());
  it('stays pending when the ad was closed within 2 seconds', () => {
    markPendingPostMatchAd('online:a');
    settlePostMatchAd('online:a', 'shown', 2000);
    expect(getPendingPostMatchAd()?.matchKey).toBe('online:a');
  });
  it('stays pending when the ad was never shown', () => {
    markPendingPostMatchAd('online:a');
    settlePostMatchAd('online:a', 'unavailable', 0);
    expect(getPendingPostMatchAd()?.matchKey).toBe('online:a');
  });
  it('clears when the ad was watched', () => {
    markPendingPostMatchAd('online:a');
    settlePostMatchAd('online:a', 'shown', 6000);
    expect(getPendingPostMatchAd()).toBeNull();
  });
  it('gives up after two reopen attempts', () => {
    markPendingPostMatchAd('online:a');
    notePendingPostMatchAttempt('online:a');
    notePendingPostMatchAttempt('online:a');
    expect(getPendingPostMatchAd()).toBeNull();
  });
  it('expires after 24 hours', () => {
    markPendingPostMatchAd('online:a', 0);
    expect(getPendingPostMatchAd(25 * 3600_000)).toBeNull();
  });
});
