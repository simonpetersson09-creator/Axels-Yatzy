import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDiceTableEmpty } from './useDiceTableEmpty';

describe('empty dice table observation', () => {
  afterEach(() => vi.useRealTimers());
  it('waits until the end-of-turn sweep has finished', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ cleared, key }) => useDiceTableEmpty(cleared, key), { initialProps: { cleared: false, key: 0 } });
    rerender({ cleared: true, key: 1 });
    act(() => vi.advanceTimersByTime(800));
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(50));
    expect(result.current).toBe(true);
  });
  it('never marks a visible table empty after restart or between rolls', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ cleared, key }) => useDiceTableEmpty(cleared, key), { initialProps: { cleared: false, key: 0 } });
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current).toBe(false);
    rerender({ cleared: true, key: 1 });
    act(() => vi.advanceTimersByTime(850));
    expect(result.current).toBe(true);
    for (let roll = 1; roll <= 3; roll++) {
      rerender({ cleared: false, key: 1 });
      act(() => vi.advanceTimersByTime(1500));
      expect(result.current).toBe(false);
    }
  });
  it('cancels a pending empty notification when the next roll starts', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ cleared }) => useDiceTableEmpty(cleared, 1), { initialProps: { cleared: true } });
    act(() => vi.advanceTimersByTime(400));
    rerender({ cleared: false });
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe(false);
  });
});