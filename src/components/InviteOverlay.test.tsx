import { render, act, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), reply: vi.fn(), game: vi.fn(), navigate: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc,
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.game }) }) }),
} }));
vi.mock('react-router-dom', async importOriginal => ({ ...await importOriginal<typeof import('react-router-dom')>(), useNavigate: () => mocks.navigate }));
vi.mock('@/lib/session', () => ({ getSessionId: () => 'me' }));
vi.mock('@/lib/invites', () => ({ respondInvite: mocks.reply }));
vi.mock('framer-motion', async () => {
  const React = await import('react');
  return { AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: { div: ({ children, initial, animate, exit, transition, ...props }: Record<string, unknown>) => React.createElement('div', props, children as React.ReactNode) } };
});
import InviteOverlay from './InviteOverlay';
afterEach(() => { cleanup(); vi.useRealTimers(); });
it('keeps a pending invite on returned and thrown network errors, then honors a confirmed cancellation', async () => {
  vi.useFakeTimers();
  const invite = { id: 'inv', from_session_id: 'friend', to_session_id: 'me', status: 'pending', from_name: 'Anna', expires_at: '2099-01-01', created_at: new Date().toISOString() };
  mocks.rpc.mockResolvedValue({ data: [invite], error: null });
  render(<MemoryRouter><InviteOverlay /></MemoryRouter>);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(screen.getByText(/Anna/)).toBeInTheDocument();
  mocks.rpc.mockResolvedValue({ data: null, error: { message: 'network' } });
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(screen.getByText(/Anna/)).toBeInTheDocument();
  mocks.rpc.mockRejectedValue(new Error('offline'));
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(screen.getByText(/Anna/)).toBeInTheDocument();
  mocks.rpc.mockResolvedValue({ data: [], error: null });
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(screen.queryByText(/Anna/)).not.toBeInTheDocument();
});
it('removes an expired invite during network failure but retains a still valid invite', async () => {
  vi.useFakeTimers();
  const now = Date.now();
  const row = { from_session_id: 'friend', to_session_id: 'me', status: 'pending', created_at: new Date(now).toISOString() };
  mocks.rpc.mockResolvedValue({ data: [
    { ...row, id: 'expired-next', from_name: 'Anna', expires_at: new Date(now + 4000).toISOString() },
    { ...row, id: 'still-valid', from_name: 'Erik', expires_at: new Date(now + 60000).toISOString() },
  ], error: null });
  render(<MemoryRouter><InviteOverlay /></MemoryRouter>);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(screen.getByText(/Anna/)).toBeInTheDocument();
  mocks.rpc.mockRejectedValue(new Error('offline'));
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(screen.queryByText(/Anna/)).not.toBeInTheDocument();
  expect(screen.getByText(/Erik/)).toBeInTheDocument();
});
it('releases invitation buttons after a rejected response and retries without duplicate taps', async () => {
  vi.useFakeTimers();
  mocks.rpc.mockResolvedValue({ data: [{ id: 'retry', from_session_id: 'other', to_session_id: 'me', status: 'pending',
    from_name: 'Anna', expires_at: '2099-01-01', created_at: new Date().toISOString() }], error: null });
  mocks.reply.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ok: true });
  render(<MemoryRouter><InviteOverlay /></MemoryRouter>);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  const accept = screen.getByRole('button', { name: /Acceptera/ });
  await act(async () => { accept.click(); accept.click(); });
  expect(mocks.reply).toHaveBeenCalledTimes(1);
  expect(accept).not.toBeDisabled();
  await act(async () => { accept.click(); });
  expect(mocks.reply).toHaveBeenCalledTimes(2);
  expect(screen.queryByText(/Anna/)).not.toBeInTheDocument();
});
it('never acknowledges or opens an outbound acceptance whose lookup resolves after unmount', async () => {
  vi.useFakeTimers(); localStorage.clear(); mocks.navigate.mockClear();
  mocks.rpc.mockResolvedValue({ data: [{ id: 'late', from_session_id: 'me', to_session_id: 'other', status: 'accepted',
    game_id: 'late-game', to_name: 'Erik', created_at: new Date().toISOString() }], error: null });
  let finish: ((value: { data: { status: string }; error: null }) => void) | undefined;
  mocks.game.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const view = render(<MemoryRouter><InviteOverlay /></MemoryRouter>);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  view.unmount();
  await act(async () => { finish?.({ data: { status: 'playing' }, error: null }); });
  expect(mocks.navigate).not.toHaveBeenCalled();
  expect(localStorage.getItem('yatzy_seen_outbound_invites')).toBeNull();
});
it('expires the displayed invite even when the next network request never completes', async () => {
  vi.useFakeTimers();
  mocks.rpc.mockResolvedValue({ data: [{ id: 'hung-expiry', from_session_id: 'other', to_session_id: 'me',
    status: 'pending', from_name: 'Anna', created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 6000).toISOString() }], error: null });
  render(<MemoryRouter><InviteOverlay /></MemoryRouter>);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(screen.getByText(/Anna/)).toBeInTheDocument();
  mocks.rpc.mockReturnValue(new Promise(() => {}));
  await act(async () => { await vi.advanceTimersByTimeAsync(6100); });
  expect(screen.queryByText(/Anna/)).not.toBeInTheDocument();
});