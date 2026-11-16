import { describe, it, expect } from 'vitest';
import { canReplayLocal } from './local-match-key';
describe('replay limit', () => {
  it('allows Spela igen twice, then only Home', () => {
    expect(canReplayLocal(0)).toBe(true);
    expect(canReplayLocal(1)).toBe(true);
    expect(canReplayLocal(2)).toBe(false);
  });
});
