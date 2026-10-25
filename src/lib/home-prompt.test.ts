import { describe, expect, it } from 'vitest';
import { getHomePrompt } from './home-prompt';

describe('home announcement selection', () => {
  const none = { server: false, online: false, android: false, rate: false, notifications: false };
  it('keeps the notification question behind Android news until it closes', () => {
    expect(getHomePrompt({ ...none, android: true, notifications: true })).toBe('android');
    expect(getHomePrompt({ ...none, notifications: true })).toBe('notifications');
  });
  it('preserves the announcement priority when several are pending', () => {
    expect(getHomePrompt({ server: true, online: true, android: true, rate: true, notifications: true })).toBe('server');
    expect(getHomePrompt({ ...none, online: true, rate: true })).toBe('online');
    expect(getHomePrompt({ ...none, rate: true, notifications: true })).toBe('rate');
  });
  it('shows nothing without pending announcements', () => {
    expect(getHomePrompt(none)).toBeNull();
  });
});