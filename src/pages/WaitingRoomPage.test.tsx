import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ action: vi.fn(), navigate: vi.fn(), onChange: { fn: () => {} } }));
vi.mock('react-router-dom', () => ({ useNavigate: () => m.navigate, useSearchParams: () => [new URLSearchParams()] }));
vi.mock('@/lib/waiting-room', () => ({ roomAction: m.action, savedWaitingSeat: () => null }));
vi.mock('@/lib/i18n', () => ({ useTranslation: () => ({ t: (k: string) => k, lang: 'sv' }) }));
vi.mock('@/lib/session', () => ({ getSessionId: () => 'me' }));
vi.mock('@/lib/notifications', () => ({ getPushPermissionState: async () => 'denied' }));
vi.mock('@/lib/waiting-room-welcome', () => ({ takeWaitingRoomWelcome: () => false }));
vi.mock('@/hooks/useWaitingRoomCountries', () => ({ useWaitingRoomCountries: () => ({}) }));
vi.mock('@/hooks/useWaitingRoomChat', () => ({ useWaitingRoomChat: () => ({ connected: true, bubbles: {}, send: async () => true }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { removeChannel: vi.fn(), channel: () => {
  const c = { on: (_: unknown, __: unknown, fn: () => void) => { m.onChange.fn = fn; return c; }, subscribe: () => c }; return c;
} } }));
import WaitingRoomPage from './WaitingRoomPage';
const snapshot = () => ({ error: null, server_now: new Date().toISOString(), countdown_at: null, mine: { id: 'seat', session_id: 'me', player_name: 'Me', seat: 2, present: true, ready: false, game_id: null }, players: [] });
beforeEach(() => { vi.useFakeTimers(); m.action.mockReset(); m.navigate.mockReset(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
it('retry repeats failed initial join and obtains a seat', async () => {
  m.action.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(snapshot());
  render(<WaitingRoomPage />);
  await act(async () => {});
  fireEvent.click(screen.getByText('wrRetry'));
  await act(async () => {});
  expect(m.action.mock.calls.slice(0,2).map(c => c[0])).toEqual(['join','join']);
  expect(screen.getByText('wrBeReady')).toBeInTheDocument();
});
it('unmount invalidates queued reads and sends no stale presence commands', async () => {
  let resolve: (value: unknown) => void = () => {};
  m.action.mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValue(snapshot());
  const view = render(<WaitingRoomPage />);
  await act(async () => {});
  await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
  view.unmount();
  await act(async () => { resolve(snapshot()); });
  expect(m.action.mock.calls.map(c => c[0])).toEqual(['join']);
  expect(m.navigate).not.toHaveBeenCalled();
});
it('coalesces repeated sync requests while a request is pending', async () => {
  m.action.mockResolvedValue(snapshot()); render(<WaitingRoomPage />); await act(async () => {});
  let resolve: (value: unknown) => void = () => {};
  m.action.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  await act(async () => { m.onChange.fn(); });
  await act(async () => { for (let i=0;i<30;i++) m.onChange.fn(); });
  await act(async () => { resolve(snapshot()); });
  expect(m.action.mock.calls.filter(c => c[0] === 'sync')).toHaveLength(1);
});