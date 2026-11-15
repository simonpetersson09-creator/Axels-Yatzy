import { getSessionId } from './session';
import { getDeviceIdSync } from './device';
import { readRecoverable, writeRecoverable } from './recoverable-storage';

const KEY = 'mrb_ad_reward_receipts_v1';
export interface AdRewardReceipt { id: string; sessionId: string; deviceId: string }
export function readAdRewardReceipts(): AdRewardReceipt[] {
  try {
    const rows = JSON.parse(readRecoverable(KEY) ?? '[]');
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
    // Even if both stores are blocked, retain this confirmed receipt in memory
    // for immediate delivery and future retries with exactly the same identity.
    writeRecoverable(KEY, JSON.stringify(rows), true);
    return true;
  } catch { return false; }
}
export function removeAdRewardReceipt(id: string): void {
  writeRecoverable(KEY, JSON.stringify(readAdRewardReceipts().filter(r => r.id !== id)), true);
}