import { describe, expect, it } from 'vitest';
import { acknowledgeWaitingExpiryNotice, publishWaitingExpiryNotice, waitingExpiryNotice } from './waiting-room-expiry-notice';

describe('private waiting expiry display', () => {
  it('keeps the actual missed name and only exposes it to the same session', () => {
    publishWaitingExpiryNotice('owner-a', { id: 'notice-a', player_names: 'Simon P' });
    expect(waitingExpiryNotice('owner-a')).toEqual({ id: 'notice-a', player_names: 'Simon P' });
    expect(waitingExpiryNotice('other')).toBeNull();
  });
  it('does not lose a pending notice on a null or old-server response', () => {
    publishWaitingExpiryNotice('owner-b', { id: 'notice-b', player_names: 'Alicia' });
    publishWaitingExpiryNotice('owner-b', null);
    publishWaitingExpiryNotice('owner-b', undefined);
    expect(waitingExpiryNotice('owner-b')?.id).toBe('notice-b');
  });
  it('a delayed response cannot redisplay an acknowledged notice', () => {
    publishWaitingExpiryNotice('owner-c', { id: 'notice-c', player_names: 'Simon' });
    acknowledgeWaitingExpiryNotice('owner-c', 'notice-c');
    publishWaitingExpiryNotice('owner-c', { id: 'notice-c', player_names: 'Simon' });
    expect(waitingExpiryNotice('owner-c')).toBeNull();
  });
  it('an acknowledgement of an earlier expiry cannot erase the new expiry', () => {
    publishWaitingExpiryNotice('owner-d', { id: 'new-notice', player_names: 'Alicia' });
    acknowledgeWaitingExpiryNotice('owner-d', 'old-notice');
    expect(waitingExpiryNotice('owner-d')?.id).toBe('new-notice');
  });
});