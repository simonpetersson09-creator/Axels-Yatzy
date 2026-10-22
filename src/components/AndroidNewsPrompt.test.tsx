import { beforeEach, describe, expect, it, vi } from 'vitest';
import { shouldShowAndroidNews, markAndroidNewsSeen } from './AndroidNewsPrompt';

vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'ios' } }));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));

describe('Google Play announcement eligibility', () => {
  beforeEach(() => localStorage.clear());

  it('waits until four completed matches', () => {
    for (const completed of [0, 1, 2, 3]) {
      expect(shouldShowAndroidNews(completed)).toBe(false);
    }
    expect(shouldShowAndroidNews(4)).toBe(true);
    expect(shouldShowAndroidNews(5)).toBe(true);
  });

  it('does not repeat after it has been seen', () => {
    expect(shouldShowAndroidNews(4)).toBe(true);
    markAndroidNewsSeen();
    expect(shouldShowAndroidNews(4)).toBe(false);
    expect(shouldShowAndroidNews(20)).toBe(false);
  });
});