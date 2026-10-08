/**
 * Shared flag for "the dice are rolling but the server hasn't said where they
 * land yet" (online matches, where the server rolls). While active, a rolling
 * die keeps tumbling in place instead of landing; once cleared it resumes and
 * lands on the value it has been given. Read inside useFrame, so it never
 * causes re-renders.
 */
export const diceAwait = { active: false, since: 0 };

/** Safety cap: never tumble forever if a caller forgets to clear the flag. */
export const DICE_AWAIT_MAX_MS = 12_000;

export function setDiceAwait(active: boolean) {
  diceAwait.active = active;
  diceAwait.since = active ? Date.now() : 0;
}

export function isDiceAwaiting() {
  if (!diceAwait.active) return false;
  if (Date.now() - diceAwait.since > DICE_AWAIT_MAX_MS) {
    diceAwait.active = false;
    return false;
  }
  return true;
}

/**
 * Landing tracker: every die reports when its roll animation starts and when
 * it has visibly come to rest. When the last flying die lands, a
 * `dice:landed` window event fires — the one moment UI like the combination
 * celebrations should react to, instead of guessing with timers.
 */
const flying = new Set<number>();
export function setDieFlying(index: number, isFlying: boolean) {
  const had = flying.size > 0;
  if (isFlying) flying.add(index);
  else flying.delete(index);
  if (had && flying.size === 0 && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('dice:landed'));
  }
}
