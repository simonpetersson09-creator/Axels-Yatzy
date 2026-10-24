import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameBanner } from './useGameBanner';

const ads = vi.hoisted(() => ({ show: vi.fn(), hide: vi.fn() }));
vi.mock('@/lib/admob', () => ({ showGameBanner: ads.show, hideGameBanner: ads.hide }));

describe('match banner policy', () => {
  beforeEach(() => vi.clearAllMocks());

  it('never requests a banner when online gameplay disables it and clears previous space', () => {
    const { unmount } = renderHook(() => useGameBanner(false));
    expect(ads.show).not.toHaveBeenCalled();
    expect(ads.hide).toHaveBeenCalledTimes(1);
    unmount();
    expect(ads.show).not.toHaveBeenCalled();
  });

  it('keeps the default game banner for play against the computer', () => {
    const { unmount } = renderHook(() => useGameBanner());
    expect(ads.show).toHaveBeenCalledExactlyOnceWith('game');
    unmount();
    expect(ads.hide).toHaveBeenCalledTimes(1);
  });

  it('hides the banner when switching from an enabled screen to online gameplay', () => {
    const { rerender } = renderHook(({ active }) => useGameBanner(active), { initialProps: { active: true } });
    rerender({ active: false });
    expect(ads.show).toHaveBeenCalledTimes(1);
    expect(ads.hide).toHaveBeenCalled();
  });
});