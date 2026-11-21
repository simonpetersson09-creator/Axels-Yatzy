export interface WaitingExpiryNotice { id: string; player_names: string }
let current: { session: string; notice: WaitingExpiryNotice } | null = null;
let acknowledged: { session: string; id: string } | null = null;
const listeners = new Set<() => void>();

export function waitingExpiryNotice(session: string) {
  return current?.session === session ? current.notice : null;
}
export function publishWaitingExpiryNotice(session: string, notice: WaitingExpiryNotice | null | undefined) {
  if (!notice || typeof notice.id !== 'string' || typeof notice.player_names !== 'string') return;
  if (acknowledged?.session === session && acknowledged.id === notice.id) return;
  if (current?.session === session && current.notice.id === notice.id) return;
  current = { session, notice };
  listeners.forEach(listener => listener());
}
export function acknowledgeWaitingExpiryNotice(session: string, id: string) {
  acknowledged = { session, id };
  if (current?.session === session && current.notice.id === id) {
    current = null;
    listeners.forEach(listener => listener());
  }
}
export function subscribeWaitingExpiryNotice(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}