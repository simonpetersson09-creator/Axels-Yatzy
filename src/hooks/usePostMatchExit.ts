import { useCallback, useEffect, useRef, useState } from 'react';
import { preloadInterstitial, showPostMatchInterstitial } from '@/lib/admob';

// A result can be revisited without presenting another ad for the same match.
const attemptedMatches = new Set<string>();

export function usePostMatchExit(matchKey: string, completed: boolean, onHome: () => void) {
  const busy = useRef(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    busy.current = false;
    setLeaving(false);
  }, [matchKey]);

  useEffect(() => {
    if (completed && !attemptedMatches.has(matchKey)) void preloadInterstitial();
  }, [completed, matchKey]);

  const leave = useCallback(async (onContinue?: () => void) => {
    if (busy.current) return;
    busy.current = true;
    setLeaving(true);
    try {
      if (completed && !attemptedMatches.has(matchKey)) {
        attemptedMatches.add(matchKey);
        await showPostMatchInterstitial();
      }
    } catch { /* An ad failure must never prevent continuing. */ }
    finally { (onContinue ?? onHome)(); }
  }, [completed, matchKey, onHome]);

  return { leaving, leave };
}