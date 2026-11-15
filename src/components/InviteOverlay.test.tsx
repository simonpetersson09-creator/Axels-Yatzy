import { render, act, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/lib/session', () => ({ getSessionId: () => 'me' }));
vi.mock('@/lib/invites', () => ({ respondInvite: vi.fn() }));
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