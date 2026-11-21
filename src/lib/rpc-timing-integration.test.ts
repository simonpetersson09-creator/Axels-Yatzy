import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ session: vi.fn(), claim: vi.fn(), track: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: mocks.session } } }));
vi.mock('@/lib/session', () => ({ requireClaimedDevice: mocks.claim }));
vi.mock('@/lib/analytics', () => ({ trackEvent: mocks.track }));
vi.mock('@/lib/i18n', () => ({ t: () => 'Connection failed' }));
import { directRpc, resetTimingBudgetForTests, TIMING_EVENT_BUDGET } from './multiplayer-actions';

const body = JSON.stringify({ success: true, server_ms: 1, db_statement_ms: 1.2, db_entry_ms: 0.1, db_action_ms: 1 });
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function delayedBodyResponse(delayMs: number, headers: Record<string, string> = {}) {
  const stream = new ReadableStream({ start(controller) {
    setTimeout(() => { controller.enqueue(new TextEncoder().encode(body)); controller.close(); }, delayMs);
  } });
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'application/json', ...headers } });
}
const json = (status = 200, headers: Record<string, string> = {}, text = body) =>
  new Response(text, { status, headers: { 'Content-Type': 'application/json', ...headers } });
const events = () => mocks.track.mock.calls.map(call => call[1] as Record<string, unknown>);

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.invalid');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'public-test-key');
  mocks.session.mockResolvedValue({ data: { session: null } });
  mocks.claim.mockResolvedValue('device');
  mocks.track.mockReset();
  resetTimingBudgetForTests();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

it('12.6 s response: deadline while awaiting headers, then one result with headers→body split', async () => {
  const fetch = vi.fn(async () => { await wait(12_600); return json(200, { Date: 'Sat, 21 Nov 2026 01:15:00 GMT' }); });
  vi.stubGlobal('fetch', fetch);
  const pending = directRpc('client_roll', 'roll-dice', { p_game_id: 'g' }, {}, { attemptId: 'a1', timeoutAfterMs: 12_000 });
  await vi.advanceTimersByTimeAsync(12_600);
  const result = await pending;
  expect(result.error).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
  const [deadline, final] = events();
  expect(deadline).toMatchObject({ attempt_id: 'a1', outcome: 'deadline', stage: 'deadline', phase_at_event: 'awaiting_headers', response_received: false, timing_version: 3 });
  expect(final).toMatchObject({ attempt_id: 'a1', outcome: 'rpc_result', ok: true, phase_at_event: 'body_complete', response_received: true,
    fetch_to_headers_ms: 12_600, headers_to_body_ms: 0, http_status: 200, server_date: 'Sat, 21 Nov 2026 01:15:00 GMT',
    db_timing_available: true, gateway_request_id: null, gateway_request_id_readable: false });
});

it('late headers are attributed to dispatch→headers, not to the body', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { await wait(11_000); return json(); }));
  const pending = directRpc('client_set_locks_guarded', 'toggle-lock', {}, {}, { attemptId: 'a2' });
  await vi.advanceTimersByTimeAsync(11_000);
  await pending;
  expect(events()).toHaveLength(1);
  expect(events()[0]).toMatchObject({ outcome: 'rpc_result', fetch_to_headers_ms: 11_000, headers_to_body_ms: 0 });
});

it('slow body: headers fast, body 12.5 s; deadline observes awaiting_body', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { await wait(100); return delayedBodyResponse(12_500); }));
  const pending = directRpc('client_submit_score', 'submit-score', {}, {}, { attemptId: 'a3', timeoutAfterMs: 12_000 });
  await vi.advanceTimersByTimeAsync(12_600);
  expect((await pending).error).toBeNull();
  const [deadline, final] = events();
  expect(deadline).toMatchObject({ outcome: 'deadline', phase_at_event: 'awaiting_body', response_received: true, fetch_to_headers_ms: 100, headers_to_body_ms: null });
  expect(final).toMatchObject({ outcome: 'rpc_result', fetch_to_headers_ms: 100, headers_to_body_ms: 12_500 });
});

it('transport failure is not a received response and is never resent', async () => {
  const fetch = vi.fn(async () => { await wait(5_000); throw new TypeError('Load failed'); });
  vi.stubGlobal('fetch', fetch);
  const pending = directRpc('client_roll', 'roll-dice', {}, {}, { attemptId: 'a4' });
  await vi.advanceTimersByTimeAsync(5_000);
  const result = await pending;
  expect(result.data).toBeNull();
  expect(result.error).toBeTruthy();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(events()[0]).toMatchObject({ outcome: 'transport_error', ok: false, transport_error: 'TypeError', response_received: false,
    http_status: null, fetch_to_headers_ms: null, response_at: null, phase_at_event: 'transport_failed' });
});

it('body stream failure after headers is a body error, not a result', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({ start(c) { setTimeout(() => c.error(new TypeError('reset')), 4_000); } }), { status: 200 })));
  const pending = directRpc('client_roll', 'roll-dice', {}, {}, { attemptId: 'a5' });
  await vi.advanceTimersByTimeAsync(4_000);
  expect((await pending).error).toBeTruthy();
  expect(events()[0]).toMatchObject({ outcome: 'body_error', response_received: true, http_status: 200, phase_at_event: 'body_failed' });
});

it('HTTP error with received headers is http_error', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json(503, {}, '{"message":"unavailable"}')));
  const result = await directRpc('client_roll', 'roll-dice', {}, {}, { attemptId: 'a6' });
  expect(result.error).toBeTruthy();
  expect(events()[0]).toMatchObject({ outcome: 'http_error', http_status: 503, response_received: true });
});

it('reconnection during a 6 s wait is counted and the single response still settles', async () => {
  const fetch = vi.fn(async () => { await wait(6_000); return json(); });
  vi.stubGlobal('fetch', fetch);
  const pending = directRpc('client_roll', 'roll-dice', {}, {}, { attemptId: 'a7' });
  await vi.advanceTimersByTimeAsync(1_000);
  window.dispatchEvent(new Event('offline'));
  await vi.advanceTimersByTimeAsync(2_000);
  window.dispatchEvent(new Event('online'));
  await vi.advanceTimersByTimeAsync(3_000);
  expect((await pending).error).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(events()[0]).toMatchObject({ outcome: 'rpc_result', network_changes: 2, fetch_to_headers_ms: 6_000 });
});

it('reads a gateway request ID only where the browser exposes it', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { await wait(3_500); return json(200, { 'sb-request-id': '01a1fdd6-6e28-77dd-9954-e5db7109f1a0' }); }));
  const pending = directRpc('client_roll', 'roll-dice', {}, {}, { attemptId: 'a8' });
  await vi.advanceTimersByTimeAsync(3_500);
  await pending;
  expect(events()[0]).toMatchObject({ gateway_request_id: '01a1fdd6-6e28-77dd-9954-e5db7109f1a0', gateway_request_id_readable: true });
});

it('fast successes stay silent and the session ceiling caps slow events', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json()));
  await directRpc('client_roll', 'roll-dice', {}, {}, { attemptId: 'fast' });
  expect(mocks.track).not.toHaveBeenCalled();
  vi.stubGlobal('fetch', vi.fn(async () => { await wait(3_100); return json(); }));
  for (let i = 0; i < TIMING_EVENT_BUDGET + 5; i++) {
    const pending = directRpc('client_roll', 'roll-dice', {}, {}, { attemptId: `s${i}` });
    await vi.advanceTimersByTimeAsync(3_100);
    await pending;
  }
  expect(mocks.track).toHaveBeenCalledTimes(TIMING_EVENT_BUDGET);
});
