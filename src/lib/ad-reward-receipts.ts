import { getSessionId } from './session';
import { getDeviceIdSync } from './device';

const KEY = 'mrb_ad_reward_receipts_v1';
export interface AdRewardReceipt { id: string; sessionId: string; deviceId: string }
export function readAdRewardReceipts(): AdRewardReceipt[] {
  try {
    const rows = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(rows) ? rows.filter(r => r && typeof r.id === 'string' && typeof r.sessionId === 'string' && typeof r.deviceId === 'string') : [];
  } catch { return []; }
}
/** Only SDK-confirmed rewards enter this durable queue. Never mint a reward on restart. */
export function saveAdRewardReceipt(id: string): boolean {
  const deviceId = getDeviceIdSync();
  if (!deviceId) return false;
  try {
    const rows = readAdRewardReceipts();
    if (!rows.some(r => r.id === id)) rows.push({ id, sessionId: getSessionId(), deviceId });
    localStorage.setItem(KEY, JSON.stringify(rows));
    return true;
  } catch { return false; }
}
export function removeAdRewardReceipt(id: string): void {
  localStorage.setItem(KEY, JSON.stringify(readAdRewardReceipts().filter(r => r.id !== id)));
}