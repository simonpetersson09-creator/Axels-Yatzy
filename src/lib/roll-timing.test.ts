import { expect, it } from 'vitest';
import { rollTiming } from './roll-timing';

it('separates 200ms device claim, 100ms server and 3000ms outside-server wait', () => {
  expect(rollTiming(3300, 200, 3100, 100)).toEqual({
    total_ms: 3300, claim_ms: 200, request_ms: 3100, server_ms: 100,
    outside_server_ms: 3000, server_timing_available: true, cause_confirmed: false,
  });
});
it.each([undefined, null, -1, NaN, Infinity, 4000])('never guesses server time from an absent or invalid value: %s', value => {
  expect(rollTiming(3300, 200, 3100, value)).toMatchObject({ server_ms: null, outside_server_ms: null, server_timing_available: false });
});