import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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