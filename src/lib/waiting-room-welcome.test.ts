import { beforeEach, describe, expect, it } from 'vitest';
import { takeWaitingRoomWelcome } from './waiting-room-welcome';

describe('waiting room welcome', () => {
  beforeEach(() => localStorage.clear());
  it('shows exactly once on the same device across repeated entries', () => {
    expect(takeWaitingRoomWelcome()).toBe(true);
    expect(takeWaitingRoomWelcome()).toBe(false);
    expect(takeWaitingRoomWelcome()).toBe(false);
  });
  it('preserves the seen flag through a new storage read after an app restart', () => {
    takeWaitingRoomWelcome();
    expect(localStorage.getItem('mr-b-waiting-room-welcome-seen')).toBe('1');
    expect(takeWaitingRoomWelcome()).toBe(false);
  });
});