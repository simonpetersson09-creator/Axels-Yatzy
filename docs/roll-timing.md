# Roll timing diagnostics

`client_roll` returns `server_ms` measured with `clock_timestamp()` around its existing validation and single authoritative roll. No extra database write, roll or request is introduced. Existing device checks, privileges and response fields are preserved.

The client emits `play_roll_timing` only for slow (>3000 ms) or failed raw roll calls, through the existing durable diagnostic queue. The hook shares `attempt_id` with `roll_slow`, `roll_error` and `roll_recovered`. A late raw response can therefore supply timing after recovery has already completed the displayed roll.

Fields: `total_ms`, `claim_ms`, `request_ms`, `server_ms`, `outside_server_ms`, `server_timing_available`, `request_dispatched`, `ok`, `attempt_id`, `event_id`, `occurred_at`. No new names, device credentials, dice values, tokens or consent data are logged.

`outside_server_ms` is the request duration minus valid server duration. It includes transport, Data API queueing/transaction completion and client scheduling, **not proof of a network fault**. Device registration is separate. Missing, invalid or absent server timings remain null; calls that never return cannot supply server duration. `cause_confirmed` stays false.

Server timing is deployed by migration 0113; installed phones need the next native app release to emit client measurements. Old rows cannot be reconstructed. Tests use isolated temporary SQL objects and mocked client actions, never live player matches.

Verification: run `bunx vitest run src/lib/roll-timing-sql.test.ts src/lib/roll-timing.test.ts src/lib/multiplayer-actions.test.ts src/hooks/useMultiplayerGame.test.tsx`.

## Recovery, missing responses and durable server receipts

New clients call `client_roll_diagnosed` / `client_set_locks_diagnosed` with the same opaque `attempt_id` used for client timing. These wrappers call the existing device-checked action exactly once and save a restricted receipt. The original RPCs remain compatible with installed versions. Receipt storage is best-effort, independent of game deletion, with session-owner deletion cascading and a daily purge after 30 days. Stored fields are an opaque request/attempt ID, deletion-only session key, operation, timestamp, duration and success; no names, game IDs, dice, lock values or network information. Multiple existing lock retries can share an attempt ID but get distinct receipt IDs.

Client deadline observers record `stage: deadline` even when the raw call never settles (roll 8 s, lock 12 s), without canceling or retrying it. Late answers record `stage: response` with the same attempt ID. `response_received` distinguishes actual replies from exceptions. Existing recovery reads emit `play_recovery_timing` with read index, duration and response/error/deadline outcome; no response payload or free error text. The existing durable analytics queue retains these during temporary offline periods.

Hosted request-log retention cannot be configured with the available Cloud controls; this does not change hosted logs. Server receipts supply durable evidence of committed actions even when the phone loses a reply. Transaction aborts (including database timeouts), failures before receipt creation, missing requests, and waiting before the measured function still cannot leave a committed receipt. Absence is not proof of bad internet. No extra gameplay retry, ad change, or publishing.