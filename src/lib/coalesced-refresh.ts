// Burst notifications share one read; changes during a read get one fresh follow-up.
export function createCoalescedRefresh(read: () => Promise<unknown>, delayMs = 100) {
  let disposed = false;
  let running = false;
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = async () => {
    timer = undefined;
    if (disposed) return;
    if (running) { dirty = true; return; }
    running = true;
    try { await read(); }
    finally {
      running = false;
      if (dirty && !disposed) { dirty = false; schedule(); }
    }
  };
  const schedule = () => {
    if (disposed) return;
    if (running) { dirty = true; return; }
    if (timer === undefined) timer = setTimeout(() => { void run(); }, delayMs);
  };
  return {
    schedule,
    refresh: () => {
      if (timer !== undefined) clearTimeout(timer);
      return run();
    },
    dispose: () => { disposed = true; if (timer !== undefined) clearTimeout(timer); },
  };
}