import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/friend-requests', () => ({ listFriendRequests: vi.fn() }));
import { acceptedFriendIds } from './accepted-friends';
describe('friend approval', () => {
  it('hides Halmia until she accepts', () => {
    expect(acceptedFriendIds([{ id: 'r', incoming: false, otherId: 'halmia', otherName: 'Halmia', status: 'pending' }]).has('halmia')).toBe(false);
  });
  it('shows accepted friends in both directions', () => {
    expect([...acceptedFriendIds([
      { id: 'a', incoming: true, otherId: 'halmia', otherName: 'Halmia', status: 'accepted' },
      { id: 'b', incoming: false, otherId: 'simon', otherName: 'Simon', status: 'accepted' },
    ])]).toEqual(['halmia', 'simon']);
  });
});