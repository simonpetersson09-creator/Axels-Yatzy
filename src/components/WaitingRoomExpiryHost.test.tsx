import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import WaitingRoomExpiryHost from './WaitingRoomExpiryHost';
import { acknowledgeWaitingExpiryNotice, publishWaitingExpiryNotice } from '@/lib/waiting-room-expiry-notice';

const mocks = vi.hoisted(() => ({ session: 'host-1', dismiss: vi.fn(), action: vi.fn() }));
vi.mock('@/lib/session', () => ({ getSessionId: () => mocks.session }));
vi.mock('@/lib/i18n', () => ({ useTranslation: () => ({ lang: 'sv', t: (key: string) => key }) }));
vi.mock('@/lib/back-handler', () => ({ useBackHandler: vi.fn() }));
vi.mock('@/lib/waiting-room', () => ({ dismissWaitingExpiry: mocks.dismiss, roomAction: mocks.action, savedWaitingSeat: () => 'old-seat' }));

let sequence = 0;
beforeEach(() => {
  vi.clearAllMocks(); mocks.session = `host-${++sequence}`;
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  mocks.action.mockResolvedValue({});
  mocks.dismiss.mockImplementation(async (id: string) => acknowledgeWaitingExpiryNotice(mocks.session, id));
});
afterEach(cleanup);

describe('waiting-room return notice', () => {
  it('keeps the notice until successful acknowledgement, retrying after a network failure', async () => {
    publishWaitingExpiryNotice(mocks.session, { id: 'ack-notice', player_names: 'Simon P' });
    mocks.dismiss.mockRejectedValueOnce(new Error('offline'));
    render(<MemoryRouter><WaitingRoomExpiryHost /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mocks.dismiss).toHaveBeenCalledTimes(2);
    expect(mocks.dismiss).toHaveBeenLastCalledWith('ack-notice');
  });
  it('waits for foreground return and validates membership without joining', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    publishWaitingExpiryNotice(mocks.session, { id: 'background-notice', player_names: 'Alicia' });
    render(<MemoryRouter><WaitingRoomExpiryHost /></MemoryRouter>);
    expect(screen.queryByRole('dialog')).toBeNull();
    await act(async () => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(mocks.action).toHaveBeenCalledExactlyOnceWith('sync', { seatId: 'old-seat' });
  });
  it('does not interrupt an ongoing online match', () => {
    publishWaitingExpiryNotice(mocks.session, { id: 'game-notice', player_names: 'Simon' });
    render(<MemoryRouter initialEntries={['/multiplayer-game']}><WaitingRoomExpiryHost /></MemoryRouter>);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mocks.action).not.toHaveBeenCalled();
  });
});