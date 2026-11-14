import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: mocks.session } } }));
import { observedRpc } from './observed-rpc';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); mocks.session.mockReset(); });

it.each(['client_roll_diagnosed', 'client_set_locks_diagnosed', 'client_submit_score_diagnosed'])('%s marks dispatch only after a 3500ms session wait and sends once', async rpc => {
  vi.useFakeTimers();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.invalid');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'public-test-key');
  mocks.session.mockImplementation(async () => {
    await new Promise(resolve => setTimeout(resolve, 3500));
    return { data: { session: null } };
  });
  const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    await new Promise(resolve => setTimeout(resolve, 100));
    return new Response(JSON.stringify({ success: true, server_ms: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetch);
  const dispatch = vi.fn();
  const response = observedRpc(rpc, { p_attempt_id: 'isolated' }, dispatch);
  // Postgrest builders are lazy; start it as the real caller does.
  const pending = Promise.resolve(response);
  await vi.advanceTimersByTimeAsync(3499);
  expect(dispatch).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(dispatch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(100);
  expect((await pending).data).toEqual({ success: true, server_ms: 1 });
  expect(mocks.session).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0]?.[0]).toBe(`https://example.invalid/rest/v1/rpc/${rpc}`);
});

it('preserves the existing session authorization and ignores observer errors', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.invalid');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'public-test-key');
  mocks.session.mockResolvedValue({ data: { session: { access_token: 'isolated-fake-token' } } });
  const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer isolated-fake-token');
    return new Response('{"success":true}', { headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetch);
  expect((await observedRpc('client_roll', {}, () => { throw new Error('observer only'); })).data).toEqual({ success: true });
  expect(fetch).toHaveBeenCalledTimes(1);
});