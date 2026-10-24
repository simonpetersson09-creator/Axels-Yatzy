import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('framer-motion', () => ({ AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>, motion: { div: ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div> } }));
const m = vi.hoisted(() => ({ send: vi.fn(), respond: vi.fn(), card: vi.fn(), navigate: vi.fn(), error: vi.fn() }));
vi.mock('react-router-dom', () => ({ useNavigate: () => m.navigate }));
vi.mock('@/lib/session', () => ({ getSessionId: () => 'me' }));
vi.mock('@/lib/accepted-friends', () => ({ useAcceptedFriends: () => ({ ids: new Set(['a','b']) }) }));
vi.mock('@/lib/friend-requests', () => ({ getAcceptedFriendMatches: async () => ({ data: [], error: null }) }));
vi.mock('@/lib/known-friends', () => ({ getKnownFriends: () => [{ id: 'a', name: 'Anna' }, { id: 'b', name: 'Bo' }], addKnownFriends: vi.fn(), subscribeKnownFriends: () => () => {} }));
vi.mock('@/lib/friend-aliases', () => ({ getFriendAliases: () => ({}), resolveFriendId: (id: string) => id, subscribeFriendAliases: () => () => {} }));
vi.mock('@/lib/friend-stats', () => ({ getHiddenFriends: () => [] }));
vi.mock('@/lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/invites', () => ({ sendInvite: m.send, respondInvite: m.respond }));
vi.mock('@/lib/gold-dice', () => ({ fetchPlayerCard: m.card }));
vi.mock('@/lib/avatar-sync', () => ({ useAvatarsByIds: () => ({}) }));
vi.mock('@/lib/notif-context', () => ({ askNotificationsFor: async () => {} }));
vi.mock('sonner', () => ({ toast: { error: m.error } }));
vi.mock('@/components/DiceInfoSheet', () => ({ DiceInfoSheet: ({ name, onClose }: { name: string; onClose: () => void }) => <div><span>{name} card</span><button onClick={onClose}>close card</button></div> }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  rpc: async () => ({ data: [], error: null }), removeChannel: vi.fn(),
  channel: () => { const c = { on: () => c, subscribe: () => c }; return c; },
  from: () => { const q = { select: () => q, eq: () => q, in: () => q, order: () => q, limit: async () => ({ data: [], error: null }) }; return q; },
} }));
import { FriendsList } from './FriendsList';
import { runTopBackHandler } from '@/lib/back-handler';
beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); m.send.mockReset().mockResolvedValue({ ok: true, inviteId: 'invite' }); m.respond.mockReset(); m.card.mockReset(); m.navigate.mockReset(); m.error.mockReset(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
async function openInvite() { render(<FriendsList />); await act(async () => {}); fireEvent.click(screen.getAllByRole('button', { name: 'inviteFriend' })[0]); await act(async () => {}); }
it('Android back minimizes an invite without cancelling it', async () => {
  await openInvite(); expect(screen.getByText('inviteWaitingTitle')).toBeInTheDocument();
  act(() => { expect(runTopBackHandler()).toBe(true); });
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  expect(screen.queryByText('inviteWaitingTitle')).not.toBeInTheDocument(); expect(m.respond).not.toHaveBeenCalled();
});
it('failed cancellation retains invite and successful retry closes it', async () => {
  m.respond.mockResolvedValueOnce({ ok: false, error: 'offline' }).mockResolvedValueOnce({ ok: true });
  await openInvite(); fireEvent.click(screen.getByRole('button', { name: /^cancel$/ })); await act(async () => {});
  expect(screen.getByText('inviteWaitingTitle')).toBeInTheDocument(); expect(m.error).toHaveBeenCalledWith('offline');
  fireEvent.click(screen.getByRole('button', { name: /^cancel$/ })); await act(async () => {});
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  expect(screen.queryByText('inviteWaitingTitle')).not.toBeInTheDocument(); expect(m.respond).toHaveBeenCalledTimes(2);
});
it('late empty card result never redirects away from a newer card', async () => {
  let resolve: (value: unknown) => void = () => {};
  m.card.mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValueOnce({});
  render(<FriendsList />); await act(async () => {});
  fireEvent.click(screen.getByText('Anna')); fireEvent.click(screen.getByText('Bo')); await act(async () => {});
  await act(async () => { resolve(null); });
  expect(screen.getByText('Bo card')).toBeInTheDocument(); expect(m.navigate).not.toHaveBeenCalled();
});
it('closed player card ignores its late empty response', async () => {
  let resolve: (value: unknown) => void = () => {};
  m.card.mockImplementation(() => new Promise(r => { resolve = r; }));
  render(<FriendsList />); await act(async () => {}); fireEvent.click(screen.getByText('Anna'));
  fireEvent.click(screen.getByText('close card')); await act(async () => { resolve(null); });
  expect(m.navigate).not.toHaveBeenCalled();
});