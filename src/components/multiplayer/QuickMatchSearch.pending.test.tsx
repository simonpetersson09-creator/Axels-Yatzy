import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ rpc: vi.fn(), read: vi.fn(), claim: vi.fn(), back: undefined as undefined | (() => void) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: m.rpc, from: () => ({ select: () => ({ eq: m.read }) }) } }));
vi.mock('@/lib/session', () => ({ getSessionId: () => 'isolated', requireClaimedDevice: m.claim }));
vi.mock('@/lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/back-handler', () => ({ useBackHandler: (_active: boolean, callback: () => void) => { m.back = callback; } }));
vi.mock('@/hooks/useGameBanner', () => ({ useGameBanner: () => undefined }));
import { QuickMatchSearch } from './QuickMatchSearch';
beforeEach(() => {
  vi.useFakeTimers();
  m.claim.mockReset().mockResolvedValue('device');
  m.read.mockReset().mockResolvedValue({ data: [{ session_id: 'other', player_name: 'Other', is_bot: false }] });
  m.rpc.mockReset().mockResolvedValue({ data: { status: 'matched', game_id: 'isolated-game' }, error: null });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
it.each(['button', 'back', 'unmount'])('does not open a late matched game after cancellation via %s', async method => {
  const matched = vi.fn(); const cancelled = vi.fn();
  let releaseRead: ((value: unknown) => void) | undefined;
  if (method === 'button') m.read.mockImplementationOnce(() => new Promise(resolve => { releaseRead = resolve; }));
  const view = render(<QuickMatchSearch playerName="Test" onMatched={matched} onNoMatch={vi.fn()} onCancel={cancelled} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  if (method === 'button') fireEvent.click(screen.getByRole('button', { name: 'cancelSearch' }));
  else if (method === 'back') act(() => { m.back?.(); });
  else view.unmount();
  await act(async () => { releaseRead?.({ data: [{ session_id: 'other', player_name: 'Other', is_bot: false }] }); });
  await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
  expect(matched).not.toHaveBeenCalled();
  if (method !== 'unmount') expect(cancelled).toHaveBeenCalledTimes(1);
});
it('does not announce or open a matched response received after leaving the search', async () => {
  let release: ((value: unknown) => void) | undefined;
  m.rpc.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const matched = vi.fn();
  const view = render(<QuickMatchSearch playerName="Test" onMatched={matched} onNoMatch={vi.fn()} onCancel={vi.fn()} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  view.unmount();
  await act(async () => {
    release?.({ data: { status: 'matched', game_id: 'isolated-game' }, error: null });
    await vi.advanceTimersByTimeAsync(2500);
  });
  expect(m.read).not.toHaveBeenCalled();
  expect(matched).not.toHaveBeenCalled();
});