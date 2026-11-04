import { renderHook, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const ads = vi.hoisted(() => ({ preloadInterstitial: vi.fn(async () => true) }));
vi.mock('@/lib/admob', () => ads);
import { usePostMatchPreload } from './usePostMatchPreload';
beforeEach(() => ads.preloadInterstitial.mockClear());
afterEach(cleanup);
it('preloads only at the end and once per match, including repeated turns', () => {
  const { rerender } = renderHook(({ key, round }) => usePostMatchPreload(key, round, true), { initialProps: { key: 'a', round: 12 } });
  expect(ads.preloadInterstitial).not.toHaveBeenCalled();
  rerender({ key: 'a', round: 13 });
  rerender({ key: 'a', round: 14 }); rerender({ key: 'a', round: 15 });
  expect(ads.preloadInterstitial).toHaveBeenCalledOnce();
  rerender({ key: 'b', round: 13 });
  expect(ads.preloadInterstitial).toHaveBeenCalledTimes(2);
});
it('never requests inventory without a match identity', () => {
  renderHook(() => usePostMatchPreload(null, 13, true));
  expect(ads.preloadInterstitial).not.toHaveBeenCalled();
});
it('does not preload for inactive or forfeited matches even in round 15', () => {
  renderHook(() => usePostMatchPreload('forfeit', 15, false));
  expect(ads.preloadInterstitial).not.toHaveBeenCalled();
});