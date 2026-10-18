import { showOptionalRewarded, type RewardedResult } from '@/lib/admob';

/** One opt-in bundle, retained across page changes until two distinct ads earn rewards. */
export function createRewardedPair(show: (late: () => void) => Promise<RewardedResult>) {
  let completed = 0;
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
            notify();
          };
          const result = await show(accept);
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