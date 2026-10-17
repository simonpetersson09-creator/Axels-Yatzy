import { useEffect, useState } from 'react';
import { listFriendRequests, type FriendRequest } from '@/lib/friend-requests';
export function acceptedFriendIds(requests: FriendRequest[]): Set<string> {
  return new Set(requests.filter(r => r.status === 'accepted').map(r => r.otherId));
}
export function useAcceptedFriends() {
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  useEffect(() => {
    let alive = true;
    const load = async () => { const next = await listFriendRequests(); if (alive) setRequests(next); };
    void load();
    const interval = setInterval(load, 15000);
    window.addEventListener('friend-requests-changed', load);
    return () => { alive = false; clearInterval(interval); window.removeEventListener('friend-requests-changed', load); };
  }, []);
  return { requests, ids: acceptedFriendIds(requests) };
}
