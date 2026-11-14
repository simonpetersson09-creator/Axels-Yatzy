# Online diagnostics flow sweep — 14 November 2026

Rule: a pending action must not be duplicated because its reply is late; problem reports survive interrupted delivery with stable IDs and do not double-count new receipts. Settled records and unrelated permissions/settings are unchanged.

| Place inspected | Result |
| --- | --- |
| MultiplayerProvider, friend-game lobby and MultiplayerGamePage (friend and quick matches) | Both modes share the corrected hook. Roll, lock, score and forfeit controls use the same action guards. |
| Host Start in LobbyWaitingRoom / startGame | Found missing live-request guard; added per-game ownership and a duplicate-tap regression test. |
| createGame / joinGame / LobbyJoinForm | Single request per invocation, no timeout resends; automatic entry uses one-shot refs and manual controls use loading state. No transport retry change needed. |
| roll and recovery polling | Resend only after a rejected network call plus authoritative unchanged-roll read, once, in the current foreground game. Timeout alone does not permit resend. |
| full lock batching and 12/15-second deadlines | Actual request remains the chain owner. The 15-second observer no longer discards it. Later batches wait and use current turn guards. |
| score submission and saved-score reconciliation | One mutation, committed-score read before failure, no concurrent resend. Same attempt ID is passed to diagnosed score wrapper. |
| forfeit button and error-toast retry | Found manual retry could overlap a still-live request after UI timeout. Added live per-game ownership; accepted late exits retain terminal state. |
| heartbeat / foreground reconnect / manual refresh | Presence requests coalesce per game; visibility-based periodic suppression and resume debounce remain. Reads do not resend mutations. |
| legacy toggle-lock edge paths | Single-die toggle already sent once. Full-batch path used transport-abort resend; removed it from shared helper and deployed toggle-lock. |
| legacy submit-score edge path | Removed transport-abort resend; failed answers reconcile saved scores without a second mutation. Deployed submit-score. |
| directRpc / client_roll_diagnosed / client_set_locks_diagnosed | One device-checked mutation, response/deadline telemetry and correlated server receipts. No extra mutation for diagnostics. |
| client_submit_score_diagnosed / internal_record_request_timing | Found operation CHECK allowed only roll/lock, silently discarding score receipts. Expanded allowed operations to score; existing rows untouched. |
| analytics enqueue / flush / reload / pagehide | mp_issue now durable, stable ID and original occurrence time retained. Failed delivery remains queued; successful reply clears it. Existing bounded local queue remains unchanged. |
| log_analytics_events | New delivery-ID column and per-device/event unique index prevent duplicate new deliveries. Legacy records without IDs remain untouched. |
| admin issue aggregation | Uses same stored mp_issue rows and existing release/platform filters. Delayed events still use server receipt day in admin; occurrence time is preserved in metadata for investigation. No historical regrouping. |
| internal_cleanup_diagnostics and daily timing purge | Existing 30-day rules preserved. No new retry job. |
| delete_player_data / session owner cascade | Existing device-bound deletion removes analytics (including delivery IDs); timing receipts cascade with owner. No extra retained identity ledger. |

Validation: 64 targeted tests passed, including isolated SQL contracts, timeout overlap tests and stable-ID delivery tests. Running-browser delivery exercise: failed delivery → reload → same ID → accepted response → queue cleared. No production test reports written. Physical iPhone/Android checks still require signed builds and devices; the original transport delay cause is not established.

## Additional slow-response sweep

Reread the central create/join/start, presence/resume/realtime, lock chain, score reconciliation and forfeit flows, their action helper and diagnostic wrappers, as well as legacy roll/score/lock/forfeit handlers. Their previously corrected mutation rules remain in place; no evidence establishes the root cause of today's 3–11 second transport waits.

Two independently implemented paths violated ownership before the mutation:

- `LobbyJoinForm`: name validation occurred before loading blocked subsequent entry taps. A shared synchronous entry guard now covers name validation and the awaited create/join callback for manual and automatic entry. Leaving before name validation returns prevents a new dispatch.
- `QuickMatchTakeover`: ownership began only after both reads. A slow first read allowed interval ticks to overlap; a late read after unmount could still start a bot turn. Ownership now covers the entire tick, and stopped checks follow both reads.

The server bot handler's existing idle validation and sequential turn loop, as well as scheduled sweep, were read; no server or cron behavior was changed in this follow-up. These client overlap defects are not proven causes of the reported iPhone waits. No new transport polling, settings, permissions or historical mutations were introduced.

Three regression cases failed before the correction and passed afterwards. The full targeted run passed 67 tests. An isolated 393 × 706 browser flow verified a three-second name check with both entry buttons disabled, exactly one create request and no join request, followed by a visible controlled response. Screenshots were inspected. Physical native and production two-device verification remain unavailable. Root architecture guidance is at its protected size budget, so no new root rule was saved.

## Fetch-boundary timing correction

Rule: total observed waiting remains real, but a client session check must not be labelled a dispatched request or attributed to server reception.

- Roll, full-batch lock and score in both friend and quick games share `directRpc`; all now observe fetch entry through request-local `observedRpc`. The existing client's session supplies authorization; the observer creates no independent auth/refresh lifecycle, patches no global fetch, and adds no resend or cancellation.
- Version 2 records separate claim, client preparation and post-fetch-entry elapsed time, plus the original total. Deadlines before fetch entry keep `request_dispatched=false` and `requested_at=null`; late responses retain the same attempt ID. Fetch entry does not prove bytes left the device or reached the server; post-entry duration includes browser transport scheduling and response processing.
- Recovery reads report whole `read_ms` with `cause_confirmed=false`, not server-only time; unchanged. Start/create/join, presence/resume, forfeit, results backfill and takeover make no dispatch-timing assertion; unchanged.
- Legacy roll/toggle/full-lock/score handlers measure the handler/database segment only. Their `cold` flag describes first handler use, not measured cold-start duration. Existing `server_ms` receipts measure the game function, excluding later receipt insertion/commit; none prove the full request/response duration.
- Analytics persists opaque metadata and original IDs; admin table/diagram count issues, not transport duration. Server receipts, cleanup, deletion, notifications and scheduled jobs remain unchanged. No settled records, permissions, settings or example data are rewritten.

Physical signed iPhone/Android verification and the original latency root cause remain unverified.

## Slow-response lifecycle follow-up

Reread create/join/name validation, host start, roll/lock/score and recovery, presence/resume, forfeit and results backfill, matchmaking/announcement, takeover and server bot sweep, waiting-room commands/reads, legacy handlers, receipts/analytics/admin and cleanup. Existing ordering and confirmation guards remain unchanged except matchmaking: a matched announcement could call `onMatched` after cancellation/unmount. Request-local disposal and synchronous cancellation now suppress late UI/callbacks after each awaited step, without aborting or repeating mutations, leaving accepted games and history untouched. Button/back/unmount/late-response regressions cover the defect. The 750ms roll landing and 3s/4s recovery starts are deliberate presentation/recovery delays, not proof of the original latency cause.