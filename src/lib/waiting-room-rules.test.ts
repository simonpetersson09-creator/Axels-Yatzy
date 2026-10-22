import { describe, expect, it } from 'vitest';
import { allReady, COUNTDOWN_SECONDS, otherWaitingCount, recallDeadline, WAIT_SECONDS, type WaitingPlayer } from './waiting-room-rules';
const player = (id: string, extra: Partial<WaitingPlayer> = {}): WaitingPlayer => ({ id, session_id: id, player_name: id, seat: 0, present: true, ready: true, expires_at: new Date(1000000).toISOString(), recall_until: null, ...extra });
describe('waiting-room rules', () => {
  it('starts with two, without waiting for four', () => expect(allReady([player('a'), player('b')])).toBe(true));
  it('requires all three', () => expect(allReady([player('a'), player('b'), player('c', { ready: false })])).toBe(false));
  it('requires all four', () => expect(allReady([player('a'), player('b'), player('c'), player('d', { ready: false })])).toBe(false));
  it('cannot start alone', () => expect(allReady([player('a')])).toBe(false));
  it('cannot start with an absent player', () => expect(allReady([player('a'), player('b', { present: false })])).toBe(false));
  it('has no solo waiting time limit', () => expect(WAIT_SECONDS).toBeNull());
  it('counts down three seconds', () => expect(COUNTDOWN_SECONDS).toBe(3));
  it('allows exactly 120 seconds to become ready', () => expect(recallDeadline(1000)).toBe(121000));
  it('indicator excludes own seat', () => expect(otherWaitingCount([player('a'), player('b')], 'a', 0)).toBe(1));
  it('indicator includes absent seats', () => expect(otherWaitingCount([player('b', { present: false })], 'a', 0)).toBe(1));
  it('indicator includes solo seats after the old expiry', () => expect(otherWaitingCount([player('b', { expires_at: new Date(100).toISOString() })], 'a', 100000)).toBe(1));
  it('indicator excludes nonready players at their deadline', () => expect(otherWaitingCount([player('b', { ready: false, recall_until: new Date(100).toISOString() })], 'a', 100)).toBe(0));
});