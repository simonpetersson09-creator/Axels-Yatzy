import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
import { useWaitingRoomCountries } from './useWaitingRoomCountries';

describe('waiting room public countries', () => {
  beforeEach(() => { rpc.mockReset(); });
  it('reads the existing country for each distinct player without repeated heartbeat reads', async () => {
    rpc.mockImplementation(async (_name, args) => ({ data: { country: args.p_session_id === 'swedish' ? 'SE' : 'KR' }, error: null }));
    const { result, rerender } = renderHook(({ ids }) => useWaitingRoomCountries(ids), { initialProps: { ids: ['swedish', 'korean', 'swedish'] } });
    await waitFor(() => expect(result.current).toEqual({ swedish: 'SE', korean: 'KR' }));
    rerender({ ids: ['korean', 'swedish'] });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledWith('get_country_rank', { p_session_id: 'korean' });
  });
  it('does not invent a country when public information is absent or unavailable', async () => {
    rpc.mockResolvedValueOnce({ data: { found: false }, error: null })
      .mockResolvedValueOnce({ data: { country: 'invalid' }, error: null })
      .mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useWaitingRoomCountries(['a', 'b', 'c']));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(3));
    expect(result.current).toEqual({});
  });
});