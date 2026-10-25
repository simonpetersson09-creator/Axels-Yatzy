export type HomePrompt = 'server' | 'online' | 'android' | 'rate' | 'notifications';

/** One home announcement at a time, in the existing presentation order. */
export function getHomePrompt(pending: Record<HomePrompt, boolean>): HomePrompt | null {
  const order: HomePrompt[] = ['server', 'online', 'android', 'rate', 'notifications'];
  return order.find(prompt => pending[prompt]) ?? null;
}