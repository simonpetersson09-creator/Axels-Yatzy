import { beforeEach, describe, expect, it, vi } from 'vitest';
const track = vi.hoisted(() => vi.fn());
vi.mock('@/lib/analytics', () => ({ trackEvent: track }));
import { searchWaitMs, reportPushTapNavigated, reportPushTapGameShown, __resetPlayTimingForTests } from './play-timing';

describe('play timing', () => {
  beforeEach(() => { track.mockReset(); __resetPlayTimingForTests(); });
  it('measures search wait and caps at 30 minutes', () => {
    expect(searchWaitMs(1_000, 16_000)).toBe(15_000);
    expect(searchWaitMs(undefined, 5)).toBeNull();
    expect(searchWaitMs(0 + 1, 1 + 60 * 60 * 1000)).toBe(30 * 60 * 1000);
  });
  it('logs tap → navigation and tap → game shown once for the tapped game', () => {
    reportPushTapNavigated('turn', 1_000, 'g1', 1_250);
    reportPushTapGameShown('other', 2_000);
    reportPushTapGameShown('g1', 4_000);
    reportPushTapGameShown('g1', 5_000);
    expect(track.mock.calls).toEqual([
      ['push_tap_navigated', { kind: 'turn', ms: 250, has_game: true }],
      ['push_tap_game_shown', { kind: 'turn', ms: 3_000 }],
    ]);
  });
  it('ignores a game shown more than 2 minutes after the tap', () => {
    reportPushTapNavigated('turn', 0, 'g1', 100);
    reportPushTapGameShown('g1', 120_001);
    expect(track.mock.calls.map(c => c[0])).toEqual(['push_tap_navigated']);
  });
});
