import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useYatzyGame } from './useYatzyGame';
import { getActiveGames, setActiveGame } from '@/lib/active-game';
beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-24T10:00:00Z')); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
it('rolling an older local slot refreshes only that slot', () => {
  const { result } = renderHook(() => useYatzyGame('older'));
  act(() => { result.current.startGame(['Me']); });
  setActiveGame({ type: 'local', gameId: 'newer', timestamp: Date.now() });
  const previous = getActiveGames().find(g => g.gameId === 'newer')?.lastRollTime;
  vi.advanceTimersByTime(10000);
  act(() => { result.current.roll(); });
  expect(getActiveGames().find(g => g.gameId === 'older')?.lastRollTime).toBe(Date.now());
  expect(getActiveGames().find(g => g.gameId === 'newer')?.lastRollTime).toBe(previous);
});