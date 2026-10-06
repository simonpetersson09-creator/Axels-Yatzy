import { useEffect, useRef } from 'react';

/**
 * Stack of "close me" handlers for open overlays (sheets, dialogs). The
 * Android back button runs the most recently opened one first.
 */
const stack: Array<{ id: number; fn: () => void }> = [];
let nextId = 1;

/** Run the topmost overlay handler. Returns true if one was handled. */
export function runTopBackHandler(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.fn();
  return true;
}

/** Registers `onBack` while `active` is true (e.g. while a sheet is open). */
export function useBackHandler(active: boolean, onBack: () => void) {
  const fnRef = useRef(onBack);
  fnRef.current = onBack;
  useEffect(() => {
    if (!active) return;
    const id = nextId++;
    stack.push({ id, fn: () => fnRef.current() });
    return () => {
      const i = stack.findIndex((h) => h.id === id);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [active]);
}
