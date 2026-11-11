import { useEffect, useState } from 'react';

/** Observe the existing 0.8 s sweep; never changes dice presentation. */
export function useDiceTableEmpty(cleared: boolean, resetKey: number) {
  const [finishedReset, setFinishedReset] = useState<number | null>(null);
  useEffect(() => {
    setFinishedReset(null);
    if (!cleared) return;
    const timer = setTimeout(() => setFinishedReset(resetKey), 850);
    return () => clearTimeout(timer);
  }, [cleared, resetKey]);
  return cleared && finishedReset === resetKey;
}