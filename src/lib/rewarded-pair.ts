import { showOptionalRewarded, type RewardedResult } from '@/lib/admob';

const STORAGE_KEY = 'yatzy_ad_pair_v1';
/** A single ad view may never hang the bundle longer than this. */
const AD_HARD_TIMEOUT_MS = 120_000;

/** One opt-in ad earns one reward; retain the shared instance across page changes. */
export function createRewardedPair(show: (late: () => void) => Promise<RewardedResult>) {
  // Old partial bundles cannot prove a new SDK reward or trigger an extra ad.
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* private mode */ }
  let busy = false;
  let generation = 0;
  let reward: (() => void) | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(fn => fn());
  return {
    getCompleted: () => 0,
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    setRewardHandler: (fn: (() => void) | null) => { reward = fn; },
    async run(): Promise<RewardedResult> {
      if (busy) return 'busy';
      busy = true;
      try {
          const bundle = generation;
          let counted = false;
          const accept = () => {
            if (counted || bundle !== generation) return;
            counted = true;
            generation += 1;
            reward?.();
            notify();
          };
          // Hard timeout: if the native ad never reports back (no show, no
          // dismiss), release the bundle instead of blocking it until restart.
          // A reward confirmed AFTER the timeout (long ad + late close) still
          // pays exactly once via accept().
          const shown = show(accept);
          void shown.then((r) => { if (r === 'rewarded') accept(); }, () => {});
          const result = await Promise.race<RewardedResult>([
            shown,
            new Promise<RewardedResult>((r) => setTimeout(() => r('not_earned'), AD_HARD_TIMEOUT_MS)),
          ]);
          if (result !== 'rewarded') return result;
          accept();
          return 'rewarded';
      } finally { busy = false; }
    },
  };
}

export const optionalAdPair = createRewardedPair(onLateReward =>
  showOptionalRewarded({ waitForCompletion: true, onLateReward }));
