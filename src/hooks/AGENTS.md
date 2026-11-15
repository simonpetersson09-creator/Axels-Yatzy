
- Online sync: every result transport shares ordered queue delivery; same-game resubscription preserves queued results, queued replay commits a rolling edge, and generation checks after recovery awaits isolate matches. Reject regressive opponent roll counts even after timeout; failed own rolls may reconcile unchanged counts. Unmount releases rolls and batched lock sends.
