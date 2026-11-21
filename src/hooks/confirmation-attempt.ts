export type ConfirmationReply = {
  data: { success?: boolean; score?: number; category_id?: string; stale_command?: boolean } | null;
  error: unknown;
};

/** A deadline observes a live mutation; it never discards or repeats it. */
export function createConfirmationAttempt(options: {
  call: () => Promise<ConfirmationReply>;
  check: () => Promise<ConfirmationReply | null>;
  isCurrent: () => boolean;
  onWaiting: () => void;
  checkAfterMs?: number;
  checkOnFailure?: boolean;
  deadlineMs: number;
}) {
  let settled = false;
  let resolve: (reply: ConfirmationReply) => void = () => {};
  const result = new Promise<ConfirmationReply>(r => { resolve = r; });
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const finish = (reply: ConfirmationReply) => {
    if (settled) return;
    settled = true;
    timers.forEach(clearTimeout);
    timers.clear();
    resolve(reply);
  };
  const cancel = () => finish({ data: null, error: new Error('confirmation cancelled') });
  const confirm = (reply: ConfirmationReply) => {
    if (settled) return;
    if (!options.isCurrent()) { cancel(); return; }
    if (!reply.error && reply.data?.success === true) finish(reply);
  };
  let checking: Promise<ConfirmationReply | null> | null = null;
  const read = () => {
    if (!checking) {
      const pending = Promise.resolve().then(options.check).catch(() => null);
      checking = pending;
      void pending.then(() => { if (checking === pending) checking = null; });
    }
    return checking;
  };
  const probe = async () => {
    if (settled) return;
    if (!options.isCurrent()) { cancel(); return; }
    const saved = await read();
    if (saved) confirm(saved);
    // Unknown/missing state never releases ownership of a live request.
  };
  const schedule = (ms: number, callback: () => void) => {
    timers.add(setTimeout(callback, ms));
  };
  if (options.checkAfterMs !== undefined) schedule(options.checkAfterMs, () => { void probe(); });
  schedule(options.deadlineMs, () => {
    if (settled) return;
    if (!options.isCurrent()) { cancel(); return; }
    options.onWaiting();
    void probe();
  });
  void Promise.resolve().then(() => {
    if (settled || !options.isCurrent()) {
      cancel();
      return { data: null, error: new Error('confirmation cancelled') };
    }
    return options.call();
  }).then(async reply => {
    if (settled) return;
    if (!options.isCurrent()) { cancel(); return; }
    if (!reply.error && reply.data?.success === true) { confirm(reply); return; }
    if (options.checkOnFailure === false) { finish(reply); return; }
    // A terminal transport/server failure still checks committed state first.
    const saved = await read();
    if (saved) confirm(saved);
    if (settled) return;
    if (!options.isCurrent()) { cancel(); return; }
    finish(reply);
  }, async error => {
    if (settled) return;
    if (options.checkOnFailure === false) {
      if (!options.isCurrent()) { cancel(); return; }
      finish({ data: null, error });
      return;
    }
    const saved = await read();
    if (saved) confirm(saved);
    if (settled) return;
    if (!options.isCurrent()) { cancel(); return; }
    finish({ data: null, error });
  });
  return { result, confirm, cancel };
}