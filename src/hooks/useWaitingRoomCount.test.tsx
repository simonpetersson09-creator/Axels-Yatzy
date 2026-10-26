import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWaitingRoomCount } from './useWaitingRoomCount';

const mocks = vi.hoisted(() => ({ action: vi.fn(), rpc: vi.fn(), revision: undefined as undefined | (() => void) }));
vi.mock('@/lib/waiting-room', () => ({ roomAction: mocks.action, savedWaitingSeat: () => 'saved-seat' }));
vi.mock('@/lib/session', () => ({ getSessionId: () => 'self' }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  rpc: mocks.rpc, removeChannel: vi.fn(), channel: () => ({ on: (_: unknown, __: unknown, cb: () => void) => {
    mocks.revision = cb; return { subscribe: () => ({}) };
  } }),
} }));

describe('home waiting seat', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.rpc.mockResolvedValue({ data: 2, error: null }); });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
  it('coalesces revision bursts and rereads membership after an in-flight change', async () => {
    vi.useFakeTimers();
    mocks.action.mockResolvedValue({ error: null, mine: { game_id: null } });
    const { result } = renderHook(useWaitingRoomCount);
    await act(async () => {});
    let resolve: (value: unknown) => void = () => {};
    mocks.action.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    await act(async () => { for (let i = 0; i < 30; i++) mocks.revision?.(); await vi.advanceTimersByTimeAsync(100); });
    expect(mocks.action).toHaveBeenCalledTimes(2);
    await act(async () => { for (let i = 0; i < 30; i++) mocks.revision?.(); });
    mocks.action.mockResolvedValue({ error: 'expired', mine: null });
    await act(async () => { resolve({ error: null, mine: { game_id: null } }); await vi.advanceTimersByTimeAsync(100); });
    expect(mocks.action).toHaveBeenCalledTimes(3);
    expect(result.current.seated).toBe(false);
    expect(mocks.action.mock.calls.every(c => c[0] === 'sync')).toBe(true);
  });
  it('shows a retained absent seat without joining or sending presence', async () => {
    mocks.action.mockResolvedValue({ error: null, mine: { id: 'saved-seat', game_id: null, present: false } });
    const { result } = renderHook(useWaitingRoomCount);
    await waitFor(() => expect(result.current.seated).toBe(true));
    expect(result.current.count).toBe(2);
    expect(mocks.action.mock.calls).toEqual([['sync', { seatId: 'saved-seat' }]]);
  });
  it('removes the indicator when the server releases the seat', async () => {
    mocks.action.mockResolvedValueOnce({ error: null, mine: { game_id: null } });
    const { result } = renderHook(useWaitingRoomCount);
    await waitFor(() => expect(result.current.seated).toBe(true));
    mocks.action.mockResolvedValue({ error: 'expired', mine: null });
    act(() => mocks.revision?.());
    await waitFor(() => expect(result.current.seated).toBe(false));
  });
  it('does not label a started match as a waiting seat', async () => {
    mocks.action.mockResolvedValue({ error: null, mine: { game_id: 'started-game' } });
    const { result } = renderHook(useWaitingRoomCount);
    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(result.current.seated).toBe(false);
  });
});