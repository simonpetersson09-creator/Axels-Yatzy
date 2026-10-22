import { describe, expect, it } from 'vitest';
import { allReady, COUNTDOWN_SECONDS, otherWaitingCount, recallDeadline, WAIT_SECONDS, type WaitingPlayer } from './waiting-room-rules';
const player = (id: string, extra: Partial<WaitingPlayer> = {}): WaitingPlayer => ({ id, session_id: id, player_name: id, seat: 0, present: true, ready: true, expires_at: new Date(1000000).toISOString(), recall_until: null, ...extra });
describe('waiting-room rules', () => {
  it('starts with two, without waiting for four', () => expect(allReady([player('a'), player('b')])).toBe(true));
  it('requires all three', () => expect(allReady([player('a'), player('b'), player('c', { ready: false })])).toBe(false));
  it('requires all four', () => expect(allReady([player('a'), player('b'), player('c'), player('d', { ready: false })])).toBe(false));
  it('cannot start alone', () => expect(allReady([player('a')])).toBe(false));
  it('cannot start with an absent player', () => expect(allReady([player('a'), player('b', { present: false })])).toBe(false));
  it('waits for 15 minutes', () => expect(WAIT_SECONDS).toBe(900));
  it('counts down three seconds', () => expect(COUNTDOWN_SECONDS).toBe(3));
  it('recalls for at most 90 seconds', () => expect(recallDeadline(1000, 1000000)).toBe(91000));
  it('recall never exceeds seat expiry', () => expect(recallDeadline(1000, 5000)).toBe(5000));
  it('indicator excludes own seat', () => expect(otherWaitingCount([player('a'), player('b')], 'a', 0)).toBe(1));
  it('indicator includes absent seats', () => expect(otherWaitingCount([player('b', { present: false })], 'a', 0)).toBe(1));
  it('indicator excludes expired seats', () => expect(otherWaitingCount([player('b', { expires_at: new Date(100).toISOString() })], 'a', 100)).toBe(0));
  it('indicator excludes expired recalls', () => expect(otherWaitingCount([player('b', { recall_until: new Date(100).toISOString() })], 'a', 100)).toBe(0));
});