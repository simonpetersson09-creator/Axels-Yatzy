// Friend requests between online players. The server allows one request per pair
// and verifies the device; accepted friends are added to the local friends list.
import { supabase } from '@/integrations/supabase/client';
import { getSessionId, claimSession } from '@/lib/session';
import { getDeviceIdSync, initDeviceId } from '@/lib/device';
import { addKnownFriends } from '@/lib/known-friends';

export interface FriendRequest {
  id: string;
  incoming: boolean;
  otherId: string;
  otherName: string;
  status: 'pending' | 'accepted' | 'declined';
}

async function auth(): Promise<string | null> {
  const device = await initDeviceId().catch(() => getDeviceIdSync());
  if (!device) return null;
  await claimSession();
  return device;
}

export async function friendRequestExists(gameId: string, toIndex: number): Promise<boolean> {
  const { data } = await supabase.rpc('friend_request_exists', { p_session_id: getSessionId(), p_game_id: gameId, p_to_index: toIndex });
  return !!data;
}

/** Returns 'sent', 'already' or 'error'. */
export async function sendFriendRequest(gameId: string, toIndex: number): Promise<'sent' | 'already' | 'error'> {
  try {
    const device = await auth();
    if (!device) return 'error';
    const { data, error } = await supabase.rpc('send_friend_request', {
      p_session_id: getSessionId(), p_device_id: device, p_game_id: gameId, p_to_index: toIndex,
    });
    if (error) return 'error';
    const r = data as { ok?: boolean; error?: string } | null;
    if (r?.ok) return 'sent';
    return r?.error === 'already' ? 'already' : 'error';
  } catch { return 'error'; }
}

export async function listFriendRequests(): Promise<FriendRequest[]> {
  try {
    const device = await auth();
    if (!device) return [];
    const { data } = await supabase.rpc('list_friend_requests', { p_session_id: getSessionId(), p_device_id: device });
    const rows = (data as Array<{ id: string; incoming: boolean; other_id: string; other_name: string; status: FriendRequest['status'] }> | null) ?? [];
    const list = rows.map((r) => ({ id: r.id, incoming: r.incoming, otherId: r.other_id, otherName: r.other_name, status: r.status }));
    // Sender side: an accepted request makes the other player a friend here too.
    const accepted = list.filter((r) => !r.incoming && r.status === 'accepted').map((r) => ({ id: r.otherId, name: r.otherName }));
    if (accepted.length) addKnownFriends(accepted);
    return list;
  } catch { return []; }
}

export async function respondFriendRequest(req: FriendRequest, accept: boolean): Promise<boolean> {
  try {
    const device = await auth();
    if (!device) return false;
    const { data } = await supabase.rpc('respond_friend_request', {
      p_id: req.id, p_session_id: getSessionId(), p_device_id: device, p_accept: accept,
    });
    const ok = !!(data as { ok?: boolean } | null)?.ok;
    if (ok && accept) addKnownFriends([{ id: req.otherId, name: req.otherName }]);
    return ok;
  } catch { return false; }
}
