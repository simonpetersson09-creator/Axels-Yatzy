// Friend invite helpers (client-side).
import { supabase } from '@/integrations/supabase/client';
import { getSessionId, requireClaimedDevice } from '@/lib/session';
import { getPlayerName } from '@/lib/session';
import { t } from '@/lib/i18n';

export interface InviteRow {
  id: string;
  from_session_id: string;
  from_name: string;
  to_session_id: string;
  to_name: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';
  game_id: string | null;
  created_at: string;
  expires_at: string;
  responded_at: string | null;
}

export async function sendInvite(opts: {
  toSessionId: string;
  toName: string;
}): Promise<{ ok: boolean; inviteId?: string; error?: string; pushDelivered?: boolean }> {
  const fromName = getPlayerName() || 'Spelare';
  let deviceId: string;
  try { deviceId = await requireClaimedDevice(); }
  catch { return { ok: false, error: t('errGeneric') }; }
  const { data, error } = await supabase.functions.invoke('send-invite', {
    body: {
      from_session_id: getSessionId(),
      from_name: fromName,
      to_session_id: opts.toSessionId,
      to_name: opts.toName,
      device_id: deviceId,
    },
  });
  if (error) return { ok: false, error: error.message };
  const res = data as { success?: boolean; invite_id?: string; error?: string; push_delivered?: boolean };
  if (!res?.success) return { ok: false, error: res?.error ?? 'Kunde inte skicka inbjudan' };
  return { ok: true, inviteId: res.invite_id, pushDelivered: res.push_delivered };
}


export async function respondInvite(opts: {
  inviteId: string;
  action: 'accept' | 'decline';
}): Promise<{ ok: boolean; gameId?: string; error?: string }> {
  let deviceId: string;
  try { deviceId = await requireClaimedDevice(); }
  catch { return { ok: false, error: t('errGeneric') }; }
  const { data, error } = await supabase.functions.invoke('respond-invite', {
    body: {
      invite_id: opts.inviteId,
      session_id: getSessionId(),
      action: opts.action,
      device_id: deviceId,
    },
  });
  if (error) return { ok: false, error: error.message };
  const res = data as { success?: boolean; game_id?: string; error?: string };
  if (!res?.success) return { ok: false, error: res?.error ?? 'Kunde inte svara på inbjudan' };
  return { ok: true, gameId: res.game_id };
}
