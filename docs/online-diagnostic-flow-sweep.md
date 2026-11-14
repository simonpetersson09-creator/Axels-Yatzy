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