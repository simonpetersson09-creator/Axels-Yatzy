import { renderHook, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const ads = vi.hoisted(() => ({ preloadInterstitial: vi.fn(async () => true) }));
vi.mock('@/lib/admob', () => ads);
import { usePostMatchPreload } from './usePostMatchPreload';
beforeEach(() => ads.preloadInterstitial.mockClear());
afterEach(cleanup);
it('preloads only at the end and once per match, including repeated turns', () => {
  const { rerender } = renderHook(({ key, end }) => usePostMatchPreload(key, end), { initialProps: { key: 'a', end: false } });
  expect(ads.preloadInterstitial).not.toHaveBeenCalled();
  rerender({ key: 'a', end: true });
  rerender({ key: 'a', end: false }); rerender({ key: 'a', end: true });
  expect(ads.preloadInterstitial).toHaveBeenCalledOnce();
  rerender({ key: 'b', end: true });
  expect(ads.preloadInterstitial).toHaveBeenCalledTimes(2);
});
it('never requests inventory without a match identity', () => {
  renderHook(() => usePostMatchPreload(null, true));
  expect(ads.preloadInterstitial).not.toHaveBeenCalled();
});