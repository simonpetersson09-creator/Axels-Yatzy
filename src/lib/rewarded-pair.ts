import { showOptionalRewarded, type RewardedResult } from '@/lib/admob';

const STORAGE_KEY = 'yatzy_ad_pair_v1';
/** A single ad view may never hang the bundle longer than this. */
const AD_HARD_TIMEOUT_MS = 120_000;

function loadCompleted(): number {
  try {
    const v = Number(localStorage.getItem(STORAGE_KEY));
    return v === 1 ? 1 : 0;
  } catch { return 0; }
}

function saveCompleted(n: number) {
  try {
    if (n > 0) localStorage.setItem(STORAGE_KEY, String(n));
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* private mode etc. */ }
}

/** One opt-in bundle, retained across page changes until two distinct ads earn rewards. */
export function createRewardedPair(show: (late: () => void) => Promise<RewardedResult>) {
  // Persisted so an app restart between the two ads does not lose the first
  // completed ad.
  let completed = loadCompleted();
  let busy = false;
  let generation = 0;
  let reward: (() => void) | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(fn => fn());
  return {
    getCompleted: () => completed,
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    setRewardHandler: (fn: (() => void) | null) => { reward = fn; },
    async run(): Promise<RewardedResult> {
      if (busy) return 'busy';
      busy = true;
      try {
        while (completed < 2) {
          const bundle = generation;
          let counted = false;
          const accept = () => {
            if (counted || bundle !== generation) return;
            counted = true;
            completed += 1;
            if (completed === 2) {
              completed = 0;
              generation += 1;
              reward?.();
            }
            saveCompleted(completed);
            notify();
          };
          // Hard timeout: if the native ad never reports back (no show, no
          // dismiss), release the bundle instead of blocking it until restart.
          const result = await Promise.race<RewardedResult>([
            show(accept),
            new Promise<RewardedResult>((r) => setTimeout(() => r('not_earned'), AD_HARD_TIMEOUT_MS)),
          ]);
          if (result !== 'rewarded') return result;
          accept();
          if (generation !== bundle) return 'rewarded';
        }
        return 'not_earned';
      } finally { busy = false; }
    },
  };
}

export const optionalAdPair = createRewardedPair(onLateReward =>
  showOptionalRewarded({ waitForCompletion: true, onLateReward }));
