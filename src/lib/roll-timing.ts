/** Legacy server_ms covers only the inner action, not the whole server request. */
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

/** SQL starts after gateway/pool admission; the remainder is never labelled network time. */
export function databaseTiming(requestMs: number, result: unknown) {
  const values = result && typeof result === 'object' ? result as Record<string, unknown> : {};
  const statement = values.db_statement_ms;
  const entry = values.db_entry_ms;
  const action = values.db_action_ms;
  const valid = typeof statement === 'number' && Number.isFinite(statement) && statement >= 0 && statement <= requestMs
    && typeof entry === 'number' && Number.isFinite(entry) && entry >= 0
    && typeof action === 'number' && Number.isFinite(action) && action >= 0
    && entry + action <= statement + 1;
  return {
    db_timing_available: valid,
    db_timing_boundary: valid ? 'statement_start_to_action_end' : null,
    db_statement_ms: valid ? statement : null,
    db_entry_ms: valid ? entry : null,
    db_action_ms: valid ? action : null,
    unaccounted_request_ms: valid ? Math.round(requestMs - statement) : null,
  };
}