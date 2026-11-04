# Roll timing diagnostics

`client_roll` returns `server_ms` measured with `clock_timestamp()` around its existing validation and single authoritative roll. No extra database write, roll or request is introduced. Existing device checks, privileges and response fields are preserved.

The client emits `play_roll_timing` only for slow (>3000 ms) or failed raw roll calls, through the existing durable diagnostic queue. The hook shares `attempt_id` with `roll_slow`, `roll_error` and `roll_recovered`. A late raw response can therefore supply timing after recovery has already completed the displayed roll.

Fields: `total_ms`, `claim_ms`, `request_ms`, `server_ms`, `outside_server_ms`, `server_timing_available`, `request_dispatched`, `ok`, `attempt_id`, `event_id`, `occurred_at`. No new names, device credentials, dice values, tokens or consent data are logged.

`outside_server_ms` is the request duration minus valid server duration. It includes transport, Data API queueing/transaction completion and client scheduling, **not proof of a network fault**. Device registration is separate. Missing, invalid or absent server timings remain null; calls that never return cannot supply server duration. `cause_confirmed` stays false.

Server timing is deployed by migration 0113; installed phones need the next native app release to emit client measurements. Old rows cannot be reconstructed. Tests use isolated temporary SQL objects and mocked client actions, never live player matches.

Verification: run `bunx vitest run src/lib/roll-timing-sql.test.ts src/lib/roll-timing.test.ts src/lib/multiplayer-actions.test.ts src/hooks/useMultiplayerGame.test.tsx`.