import { afterEach, describe, expect, it, vi } from 'vitest';
import { consumeWaitingNotification, waitingRoomAdBlocked, waitingRoomNotification } from './waiting-room';

describe('waiting-room notification return', () => {
  afterEach(() => { vi.useRealTimers(); window.history.replaceState({}, '', '/'); sessionStorage.clear(); });
  it('protects a notification return for 60 seconds without changing normal frequency', () => {
    vi.useFakeTimers(); vi.setSystemTime(100_000);
    waitingRoomNotification('old-seat');
    expect(waitingRoomAdBlocked()).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(waitingRoomAdBlocked()).toBe(false);
  });
  it('protects the entire ready and countdown screen', () => {
    window.history.replaceState({}, '', '/waiting-room');
    expect(waitingRoomAdBlocked()).toBe(true);
  });
  it('keeps the precise notified seat for cold start and consumes it once', () => {
    waitingRoomNotification('expired-seat');
    expect(consumeWaitingNotification()).toBe('expired-seat');
    expect(consumeWaitingNotification()).toBeNull();
  });
});