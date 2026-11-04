import { useEffect, useRef } from 'react';
import { preloadInterstitial } from '@/lib/admob';

/** One early inventory attempt per mounted match; never presents or waits. */
export function usePostMatchPreload(matchKey: string | null, round: number | undefined, active: boolean) {
  const attempted = useRef<string | null>(null);
  useEffect(() => {
    if (!matchKey || !active || round === undefined || round < 13 || attempted.current === matchKey) return;
    attempted.current = matchKey;
    void preloadInterstitial().catch(() => {});
  }, [matchKey, round, active]);
}