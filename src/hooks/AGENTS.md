
- Online sync: every result transport shares ordered queue delivery; same-game resubscription preserves queued results, queued replay commits a rolling edge, and subscription-generation checks after every async read or lock wait drop work started before a (re)subscription, even for the same game. Reject regressive opponent roll counts even after timeout; failed own rolls may reconcile unchanged counts. Unmount releases rolls and batched lock sends.
- Remote roll starts advance the synchronous state ref immediately, so an older result in the same batch can never restore previous dice/locks.
