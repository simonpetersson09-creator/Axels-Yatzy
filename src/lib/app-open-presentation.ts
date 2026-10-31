// This lock covers only a presentation already dispatched to native, not loads.
let pending = false;
const listeners = new Set<() => void>();
export const isAppOpenPresentationPending = () => pending;
export function subscribeAppOpenPresentation(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function setAppOpenPresentationPending(value: boolean) {
  pending = value;
  for (const listener of listeners) listener();
}