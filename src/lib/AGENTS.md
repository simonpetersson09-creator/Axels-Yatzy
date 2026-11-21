# src/lib notes
- RPC timing (observed-rpc/multiplayer-actions, timing_version 3): observe only, never retry/cancel; classify outcome (result/rejected/http/transport/body/deadline); log slow (>3 s) or failed calls, ≤2 per attempt and a per-session cap. sb-request-id is CORS-hidden in the app, so correlate via attempt_id + Date header.
