import { describe, it, expect } from 'vitest';
import { isStaleSnapshot } from './snapshot-order';

describe('isStaleSnapshot', () => {
  const last = { gameId: 'g1', updatedAt: '2026-10-08T10:00:05.000Z' };
  it('rejects an older snapshot of the same game', () => {
    expect(isStaleSnapshot(last, 'g1', '2026-10-08T10:00:04.000Z')).toBe(true);
  });
  it('accepts newer or equal snapshots', () => {
    expect(isStaleSnapshot(last, 'g1', '2026-10-08T10:00:05.000Z')).toBe(false);
    expect(isStaleSnapshot(last, 'g1', '2026-10-08T10:00:06.000Z')).toBe(false);
  });
  it('accepts any snapshot of another game or with no history', () => {
    expect(isStaleSnapshot(last, 'g2', '2020-01-01T00:00:00.000Z')).toBe(false);
    expect(isStaleSnapshot(null, 'g1', '2020-01-01T00:00:00.000Z')).toBe(false);
  });
});
