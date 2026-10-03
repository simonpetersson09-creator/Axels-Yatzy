// Personal invite code + attribution for new installs (no game code needed).
import { supabase } from '@/integrations/supabase/client';
import { getSessionId, claimSession } from '@/lib/session';
import { initDeviceId } from '@/lib/device';

const CODE_KEY = 'mrbyatzy_ref_code_v1';
const CLAIM_KEY = 'mrbyatzy_ref_claim_v1'; // 'matched' | 'asked' | 'done'
const FIRST_SEEN_KEY = 'mrbyatzy_first_seen_v1';

export async function getMyReferralCode(): Promise<string | null> {
  try {
    const cached = localStorage.getItem(CODE_KEY);
    if (cached) return cached;
    const deviceId = await initDeviceId();
    const { data } = await supabase.rpc('get_referral_code', { p_session_id: getSessionId(), p_device_id: deviceId });
    if (typeof data === 'string' && data) { localStorage.setItem(CODE_KEY, data); return data; }
  } catch { /* noop */ }
  return null;
}

/** Records that this install was seen; returns true when it is brand new (< 48h). */
function isNewInstall(): boolean {
  try {
    let first = parseInt(localStorage.getItem(FIRST_SEEN_KEY) || '0', 10);
    if (!first) {
      // Existing players (any local history) are never "new".
      const hasHistory = !!localStorage.getItem('yatzy_session_id_existing') ||
        Object.keys(localStorage).some(k => k.startsWith('yatzy_stats') || k.startsWith('mrbyatzy_online_news'));
      first = hasHistory ? 1 : Date.now();
      localStorage.setItem(FIRST_SEEN_KEY, String(first));
    }
    return Date.now() - first < 48 * 3600_000;
  } catch { return false; }
}

async function callClaim(code?: string): Promise<{ matched: boolean; error?: string }> {
  await claimSession();
  const deviceId = await initDeviceId();
  const { data, error } = await supabase.functions.invoke('referral', {
    body: { action: 'claim', session_id: getSessionId(), device_id: deviceId, code },
  });
  if (error) return { matched: false, error: 'network' };
  return (data as { matched: boolean; error?: string }) ?? { matched: false };
}

/**
 * Run once on startup. Tries automatic matching for new installs.
 * Returns 'ask' when the app should show the "Did someone invite you?" prompt.
 */
export async function autoClaimReferral(): Promise<'none' | 'ask'> {
  try {
    if (!isNewInstall()) return 'none';
    if (localStorage.getItem(CLAIM_KEY)) return 'none';
    const res = await callClaim();
    if (res.matched) { localStorage.setItem(CLAIM_KEY, 'matched'); return 'none'; }
    return 'ask';
  } catch { return 'none'; }
}

export async function claimWithCode(code: string) {
  const res = await callClaim(code);
  if (res.matched) localStorage.setItem(CLAIM_KEY, 'matched');
  return res;
}

export function markReferralAsked() {
  try { localStorage.setItem(CLAIM_KEY, 'asked'); } catch { /* noop */ }
}

/** Web invite page: log a click for the inviter's code (IP-based matching). */
export async function logReferralClick(ref: string) {
  try { await supabase.functions.invoke('referral', { body: { action: 'click', ref } }); } catch { /* noop */ }
}
