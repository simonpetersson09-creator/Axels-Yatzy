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

  it('replay waits for dismissal and blocks both replay and home double taps', async () => {
    let close: (value: string) => void = () => {};
    ads.show.mockReturnValue(new Promise(resolve => { close = resolve; }));
    const home = vi.fn();
    const replay = vi.fn();
    const { result } = renderHook(() => usePostMatchExit('replay:wait', true, home));
    let pending = Promise.resolve();
    act(() => { pending = result.current.leave(replay); });
    await act(async () => {
      await result.current.leave(replay);
      await result.current.leave();
    });
    expect(ads.show).toHaveBeenCalledOnce();
    expect(replay).not.toHaveBeenCalled();
    expect(home).not.toHaveBeenCalled();
    expect(result.current.leaving).toBe(true);
    await act(async () => { close('shown'); await pending; });
    expect(replay).toHaveBeenCalledOnce();
    expect(home).not.toHaveBeenCalled();
    await act(async () => { await result.current.leave(replay); });
    expect(replay).toHaveBeenCalledOnce();
  });

  it('each replayed match can show its own ad and subsequently return home', async () => {
    const home = vi.fn();
    const replay = vi.fn();
    const { result, rerender } = renderHook(({ key, completed }) => usePostMatchExit(key, completed, home), {
      initialProps: { key: 'replay:first', completed: true },
    });
    await act(async () => { await result.current.leave(replay); });
    rerender({ key: 'replay:second', completed: false });
    expect(result.current.leaving).toBe(false);
    rerender({ key: 'replay:second', completed: true });
    await act(async () => { await result.current.leave(replay); });
    rerender({ key: 'replay:third', completed: true });
    await act(async () => { await result.current.leave(); });
    expect(ads.show).toHaveBeenCalledTimes(3);
    expect(replay).toHaveBeenCalledTimes(2);
    expect(home).toHaveBeenCalledOnce();
  });

  it.each(['unavailable', 'failed', 'busy', 'throws'])('%s ad does not prevent replay', async (status) => {
    if (status === 'throws') ads.show.mockRejectedValue(new Error('SDK failure'));
    else ads.show.mockResolvedValue(status);
    const replay = vi.fn();
    const home = vi.fn();
    const { result } = renderHook(() => usePostMatchExit(`replay:${status}`, true, home));
    await act(async () => { await result.current.leave(replay); });
    expect(replay).toHaveBeenCalledOnce();
    expect(home).not.toHaveBeenCalled();
  });
});