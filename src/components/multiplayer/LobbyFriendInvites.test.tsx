import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ send: vi.fn(), rpc: vi.fn(), seats: vi.fn(), requests: [
  { status: 'accepted', otherId: 'one', otherName: 'One' },
  { status: 'accepted', otherId: 'two', otherName: 'Two' },
  { status: 'pending', otherId: 'pending', otherName: 'Pending' },
] }));
vi.mock('@/lib/accepted-friends', () => ({ useAcceptedFriends: () => ({ requests: mock.requests }) }));
vi.mock('@/lib/session', () => ({ getSessionId: () => 'host' }));
vi.mock('@/lib/i18n', () => ({ useTranslation: () => ({ lang: 'sv', t: (key: string) => key }) }));
vi.mock('@/lib/back-handler', () => ({ useBackHandler: vi.fn() }));
vi.mock('@/lib/invites', () => ({ sendLobbyInvites: mock.send }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mock.rpc, from: () => ({ select: () => ({ eq: mock.seats }) }) } }));
import { LobbyFriendInvites } from './LobbyFriendInvites';
beforeEach(() => { mock.rpc.mockResolvedValue({ data: [] }); mock.seats.mockResolvedValue({ data: [{ session_id: 'host' }] }); mock.send.mockReset().mockResolvedValue({ ok: true }); });
it('selects two accepted friends in one batch, excluding pending friendship', async () => {
  render(<LobbyFriendInvites gameId="created" players={[{ id: 'seat-host', name: 'Host', scores: {} }]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Bjud in från din vänlista' }));
  expect(screen.queryByLabelText('Pending')).toBeNull();
  fireEvent.click(screen.getByLabelText('One')); fireEvent.click(screen.getByLabelText('Two'));
  fireEvent.click(screen.getByRole('button', { name: 'Skicka inbjudningar (2)' }));
  await waitFor(() => expect(mock.send).toHaveBeenCalledExactlyOnceWith('created', ['one', 'two']));
});
it('one free place only allows one selected friend', async () => {
  render(<LobbyFriendInvites gameId="created" players={[0,1,2].map(i => ({ id: `seat-${i}`, name: `Player ${i}`, scores: {} }))} />);
  fireEvent.click(screen.getByRole('button', { name: 'Bjud in från din vänlista' }));
  fireEvent.click(screen.getByLabelText('One'));
  expect(screen.getByLabelText('Two')).toBeDisabled();
});
it('already seated friends are filtered by server session ID, not seat-row ID', async () => {
  mock.seats.mockResolvedValue({ data: [{ session_id: 'host' }, { session_id: 'one' }] });
  render(<LobbyFriendInvites gameId="created" players={[{ id: 'different-seat-row-id', name: 'One', scores: {} }]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Bjud in från din vänlista' }));
  await waitFor(() => expect(screen.queryByLabelText('One')).toBeNull());
  expect(screen.getByLabelText('Two')).toBeEnabled();
});
