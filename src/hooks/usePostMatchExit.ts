import { useCallback, useEffect, useRef, useState } from 'react';
import { preloadInterstitial, showPostMatchInterstitial } from '@/lib/admob';
import { trackEvent } from '@/lib/analytics';

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
    const action = onContinue ? 'replay' : 'home';
    const log = (result: string) => trackEvent('post_match_exit', { matchKey, action, completed, result });
    if (busy.current) { log('duplicate_tap'); return; }
    busy.current = true;
    setLeaving(true);
    log('clicked');
    try {
      if (completed && !attemptedMatches.has(matchKey)) {
        attemptedMatches.add(matchKey);
        const result = await showPostMatchInterstitial({ matchKey, action });
        log(result);
      } else log(completed ? 'already_attempted' : 'unfinished');
    } catch { log('failed'); /* An ad failure must never prevent continuing. */ }
    finally { log('continued'); (onContinue ?? onHome)(); }
  }, [completed, matchKey, onHome]);

  return { leaving, leave };
}