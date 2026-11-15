import { readAdRewardReceipts, removeAdRewardReceipt } from './ad-reward-receipts';
import { awardAdXp } from './dice-shop';
import { getSessionId } from './session';
import { getDeviceIdSync } from './device';

let flight: Promise<void> | null = null;
export function flushAdRewardReceipts(onPaid?: (xp: number) => void): Promise<void> {
  if (flight) return flight;
  flight = (async () => {
    for (const receipt of readAdRewardReceipts()) {
      if (receipt.sessionId !== getSessionId() || receipt.deviceId !== getDeviceIdSync()) continue;
      const result = await awardAdXp(receipt.id);
      // A deletion/page reset during the request must not restore private data.
      if (!readAdRewardReceipts().some(r => r.id === receipt.id)) continue;
      if (!result.ok) break; // Includes cooldown: pending is not proof of payment.
      removeAdRewardReceipt(receipt.id);
      if (!result.duplicate) onPaid?.(1);
    }
  })().catch(() => {}).finally(() => { flight = null; });
  return flight;
}