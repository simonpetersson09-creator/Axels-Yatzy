import { showOptionalRewarded, type RewardedResult } from '@/lib/admob';

/** Stop waiting if the SDK never reports back; native guards still own the ad. */
const AD_HARD_TIMEOUT_MS = 120_000;

/** One optional ad per reward; preserve the existing cross-page caller interface. */
export function createRewardedPair(show: (late: () => void) => Promise<RewardedResult>) {
  let busy = false;
  let reward: (() => void) | null = null;
  return {
    // Legacy partial two-ad progress is intentionally not used.
    getCompleted: () => 0,
    subscribe: (_fn: () => void) => () => {},
    setRewardHandler: (fn: (() => void) | null) => { reward = fn; },
    async run(): Promise<RewardedResult> {
      if (busy) return 'busy';
      busy = true;
      let counted = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const accept = () => {
        if (counted) return;
        counted = true;
        reward?.();
      };
      try {
        const result = await Promise.race<RewardedResult>([
          show(accept),
          new Promise<RewardedResult>((resolve) => {
            timer = setTimeout(() => resolve('not_earned'), AD_HARD_TIMEOUT_MS);
          }),
        ]);
        if (result === 'rewarded') accept();
        return result;
      } finally {
        clearTimeout(timer);
        busy = false;
      }
    },
  };
}

export const optionalAdPair = createRewardedPair(onLateReward =>
  showOptionalRewarded({ waitForCompletion: true, onLateReward }));
