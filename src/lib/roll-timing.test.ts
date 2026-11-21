import { expect, it } from 'vitest';
import { rollTiming, databaseTiming } from './roll-timing';

it('separates 200ms device claim, 100ms server and 3000ms outside-server wait', () => {
  expect(rollTiming(3300, 200, 3100, 100)).toEqual({
    total_ms: 3300, claim_ms: 200, request_ms: 3100, server_ms: 100,
    outside_server_ms: 3000, server_timing_available: true, cause_confirmed: false,
  });
});
it.each([undefined, null, -1, NaN, Infinity, 4000])('never guesses server time from an absent or invalid value: %s', value => {
  expect(rollTiming(3300, 200, 3100, value)).toMatchObject({ server_ms: null, outside_server_ms: null, server_timing_available: false });
});

it('separates SQL admission and the full locked action from unaccounted request time', () => {
  expect(databaseTiming(12600, { db_statement_ms: 8000, db_entry_ms: 500, db_action_ms: 7500 })).toEqual({
    db_timing_available: true, db_timing_boundary: 'statement_start_to_action_end',
    db_statement_ms: 8000, db_entry_ms: 500, db_action_ms: 7500, unaccounted_request_ms: 4600,
  });
});
it.each([undefined, { server_ms: 1 }, { db_statement_ms: 13000, db_entry_ms: 0, db_action_ms: 13000 },
  { db_statement_ms: 10, db_entry_ms: 8, db_action_ms: 8 }, { db_statement_ms: NaN, db_entry_ms: 0, db_action_ms: 0 }])(
  'does not infer a network fault or full server duration from invalid diagnostics: %j', value => {
    expect(databaseTiming(12600, value)).toMatchObject({ db_timing_available: false, db_statement_ms: null, unaccounted_request_ms: null });
  });