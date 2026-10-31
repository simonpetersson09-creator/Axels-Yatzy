import { useSyncExternalStore, type ReactNode } from 'react';
import { isAppOpenPresentationPending, subscribeAppOpenPresentation } from '@/lib/app-open-presentation';

/** Native dispatch cannot be cancelled: do not start gameplay until it settles. */
export function AppOpenGameGate({ children }: { children: ReactNode }) {
  const pending = useSyncExternalStore(subscribeAppOpenPresentation, isAppOpenPresentationPending);
  return pending ? null : <>{children}</>;
}