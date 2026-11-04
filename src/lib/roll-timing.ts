/** Numeric timing only: outside-server time includes transport, queueing and client scheduling, not proof of a network fault. */
export function rollTiming(totalMs: number, claimMs: number, requestMs: number, serverMs: unknown) {
  const valid = typeof serverMs === 'number' && Number.isFinite(serverMs) && serverMs >= 0 && serverMs <= requestMs;
  return {
    total_ms: Math.round(totalMs),
    claim_ms: Math.round(claimMs),
    request_ms: Math.round(requestMs),
    server_ms: valid ? serverMs : null,
    outside_server_ms: valid ? Math.round(requestMs - serverMs) : null,
    server_timing_available: valid,
    cause_confirmed: false,
  };
}