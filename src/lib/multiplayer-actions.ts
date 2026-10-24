import { supabase } from '@/integrations/supabase/client';
import { requireClaimedDevice } from '@/lib/session';
import { t } from '@/lib/i18n';

/** Both the direct and function paths wait for a confirmed device binding. */
export async function directRpc(
  rpc: 'client_roll' | 'client_set_locks' | 'client_submit_score' | 'client_start_game',
  _fallbackFn: string,
  args: Record<string, unknown>,
  _fallbackBody: Record<string, unknown>,
): Promise<{ data: any; error: any }> {
  let deviceId: string;
  try { deviceId = await requireClaimedDevice(); }
  catch { return { data: null, error: new Error(t('errGeneric')) }; }
  const { data, error } = await (supabase.rpc as any)(rpc, { ...args, p_device_id: deviceId });
  if (error) return { data: null, error };
  const result = data as { success?: boolean; error?: string } | null;
  if (!result?.success) return { data: null, error: new Error(result?.error ?? 'rpc failed') };
  return { data: result, error: null };
}

export async function invokeDeviceAction(name: string, body: Record<string, unknown>) {
  const deviceId = await requireClaimedDevice();
  return supabase.functions.invoke(name, { body: { ...body, device_id: deviceId } });
}