import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const ads = vi.hoisted(() => ({ preload: vi.fn(async () => true), show: vi.fn(async () => 'shown') }));
vi.mock('@/lib/admob', () => ({ preloadInterstitial: ads.preload, showPostMatchInterstitial: ads.show }));
import { usePostMatchExit } from './usePostMatchExit';

describe('completed-match home exit', () => {
  beforeEach(() => { ads.preload.mockClear(); ads.show.mockReset(); ads.show.mockResolvedValue('shown'); });
  afterEach(cleanup);

  it.each(['local', 'online'])('%s: waits for the ad to close before going home, only once', async (mode) => {
    let close: (value: string) => void = () => {};
    ads.show.mockReturnValue(new Promise(resolve => { close = resolve; }));
    const home = vi.fn();
    const { result } = renderHook(() => usePostMatchExit(`${mode}:finished`, true, home));
    expect(ads.preload).toHaveBeenCalledOnce();
    expect(ads.show).not.toHaveBeenCalled();
    let exit: Promise<void> = Promise.resolve();
    act(() => { exit = result.current.leave(); });
    await act(async () => { await result.current.leave(); });
    expect(ads.show).toHaveBeenCalledOnce();
    expect(home).not.toHaveBeenCalled();
    await act(async () => { close('shown'); await exit; });
    expect(home).toHaveBeenCalledOnce();
    const revisit = renderHook(() => usePostMatchExit(`${mode}:finished`, true, home));
    await act(async () => { await revisit.result.current.leave(); });
    expect(ads.show).toHaveBeenCalledOnce();
  });

  it('forfeit/unfinished result goes home without preloading or showing', async () => {
    const home = vi.fn();
    const { result } = renderHook(() => usePostMatchExit('forfeit', false, home));
    await act(async () => { await result.current.leave(); });
    expect(ads.preload).not.toHaveBeenCalled();
    expect(ads.show).not.toHaveBeenCalled();
    expect(home).toHaveBeenCalledOnce();
  });

  it.each(['unavailable', 'failed', 'busy'])('%s ad never prevents returning home', async (status) => {
    ads.show.mockResolvedValue(status);
    const home = vi.fn();
    const { result } = renderHook(() => usePostMatchExit(status, true, home));
    await act(async () => { await result.current.leave(); });
    expect(home).toHaveBeenCalledOnce();
  });
});