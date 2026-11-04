import { useEffect, useRef } from 'react';
import { preloadInterstitial } from '@/lib/admob';

/** One early inventory attempt per mounted match; never presents or waits. */
export function usePostMatchPreload(matchKey: string | null, nearEnd: boolean) {
  const attempted = useRef<string | null>(null);
  useEffect(() => {
    if (!matchKey || !nearEnd || attempted.current === matchKey) return;
    attempted.current = matchKey;
    void preloadInterstitial().catch(() => {});
  }, [matchKey, nearEnd]);
}