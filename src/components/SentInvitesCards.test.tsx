import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ reply: vi.fn(), close: vi.fn(), rpc: vi.fn(), closed: vi.fn() }));
vi.mock('@/lib/session', () => ({ getSessionId: () => 'me' }));
vi.mock('@/lib/invites', () => ({ respondInvite: mocks.reply }));
vi.mock('@/lib/friend-requests', () => ({ cancelLobby: mocks.close }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('framer-motion', () => ({ motion: { div: ({ children, initial, animate, exit, ...props }: any) => <div {...props}>{children}</div> }, AnimatePresence: ({ children }: any) => children }));
import { SentInvitesCards } from './SentInvitesCards';
const lobby = { gameId: 'game', code: 'ABC123', createdAt: '' };
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: null });
  mocks.reply.mockResolvedValue({ ok: true });
  mocks.close.mockResolvedValue(true);
  localStorage.setItem('yatzy-sent-invites', JSON.stringify(['Anna', 'Erik'].map(id => ({
    id, from_session_id: 'me', to_name: id, game_id: 'game', lobby_invite: true,
    status: 'pending', expires_at: new Date(Date.now() + 60000).toISOString(),
  }))));
});
afterEach(cleanup);
it('withdraws both linked invitations before closing their game', async () => {
  const view = render(<SentInvitesCards openLobbies={[lobby]} onLobbyClosed={mocks.closed} />);
  await act(async () => view.getByRole('button', { name: 'close' }).click());
  expect(mocks.reply.mock.calls.map(([arg]) => arg)).toEqual([
    { inviteId: 'Anna', action: 'decline' }, { inviteId: 'Erik', action: 'decline' },
  ]);
  expect(mocks.close).toHaveBeenCalledExactlyOnceWith('game');
  expect(mocks.closed).toHaveBeenCalledExactlyOnceWith('game');
  expect(JSON.parse(localStorage.getItem('yatzy-sent-invites') ?? '[]')).toEqual([]);
});
it('keeps the game when an invitation withdrawal fails', async () => {
  mocks.reply.mockResolvedValue({ ok: false });
  const view = render(<SentInvitesCards openLobbies={[lobby]} onLobbyClosed={mocks.closed} />);
  await act(async () => view.getByRole('button', { name: 'close' }).click());
  expect(mocks.close).not.toHaveBeenCalled();
  expect(mocks.closed).not.toHaveBeenCalled();
  expect(JSON.parse(localStorage.getItem('yatzy-sent-invites') ?? '[]')).toHaveLength(2);
});
it('retains the game for retry when server closing fails after successful withdrawals', async () => {
  mocks.close.mockResolvedValue(false);
  const view = render(<SentInvitesCards openLobbies={[lobby]} onLobbyClosed={mocks.closed} />);
  await act(async () => view.getByRole('button', { name: 'close' }).click());
  expect(mocks.closed).not.toHaveBeenCalled();
  await act(async () => view.getByRole('button', { name: 'close' }).click());
  expect(mocks.reply).toHaveBeenCalledTimes(2);
  expect(mocks.close).toHaveBeenCalledTimes(2);
});
it('blocks overlapping close taps while the first withdrawal is pending', async () => {
  let resolve: (result: { ok: boolean }) => void = () => {};
  mocks.reply.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const view = render(<SentInvitesCards openLobbies={[lobby]} onLobbyClosed={mocks.closed} />);
  const button = view.getByRole('button', { name: 'close' });
  await act(async () => { button.click(); button.click(); });
  expect(mocks.reply).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ ok: true }));
  expect(mocks.close).toHaveBeenCalledTimes(1);
});