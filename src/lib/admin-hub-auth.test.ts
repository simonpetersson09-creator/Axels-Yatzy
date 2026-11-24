import { createHmac, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { transpileModule, ModuleKind } from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { verifyHubToken } from '../../supabase/functions/admin-analytics/hub-auth';

vi.stubGlobal('crypto', webcrypto);
const fixtureSecret = 'public-test-fixture-not-a-production-secret';
const now = 1_795_526_400_000;
const sign = (exp: number) => `${exp}.${createHmac('sha256', fixtureSecret).update(`mrb-hub:${exp}`).digest('hex')}`;

describe('hub HMAC verification', () => {
  it('accepts a valid exp.sig token with millisecond expiry', async () => {
    expect(await verifyHubToken(sign(now + 60_000), fixtureSecret, now)).toBe(true);
  });
  it('rejects an incorrect signature', async () => {
    expect(await verifyHubToken(`${now + 60_000}.${'0'.repeat(64)}`, fixtureSecret, now)).toBe(false);
  });
  it('rejects an expired correctly signed token', async () => {
    expect(await verifyHubToken(sign(now - 1), fixtureSecret, now)).toBe(false);
  });
  it('rejects expiry exactly equal to now', async () => {
    expect(await verifyHubToken(sign(now), fixtureSecret, now)).toBe(false);
  });
  it.each([null, '', '123.invalid', '123.00.extra', `NaN.${'0'.repeat(64)}`, `9007199254740992.${'0'.repeat(64)}`])('fails closed on malformed input %s', async token => {
    expect(await verifyHubToken(token, fixtureSecret, now)).toBe(false);
  });
  it('fails closed when the shared secret is absent or different', async () => {
    expect(await verifyHubToken(sign(now + 60_000), undefined, now)).toBe(false);
    expect(await verifyHubToken(sign(now + 60_000), 'different-public-fixture', now)).toBe(false);
  });
});

// Execute the actual handler, substituting only external SDK/database and Deno environment.
function endpoint() {
  const rpc = vi.fn(async () => ({ data: [], error: null }));
  const createClient = vi.fn(() => ({ rpc }));
  let handler: ((req: Request) => Promise<Response>) | undefined;
  const source = readFileSync('supabase/functions/admin-analytics/index.ts', 'utf8').replace(/^import .*;\r?\n/gm, '');
  const js = transpileModule(source, { compilerOptions: { module: ModuleKind.ESNext } }).outputText;
  new Function('createClient', 'diagnosticRows', 'verifyHubToken', 'Deno', js)(
    createClient, (rows: unknown) => rows, verifyHubToken,
    { env: { get: (name: string) => ({ ADMIN_API_KEY: 'ordinary-public-fixture', HUB_SHARED_SECRET: fixtureSecret, SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture' } as Record<string, string>)[name] }, serve: (fn: typeof handler) => { handler = fn; } },
  );
  if (!handler) throw new Error('Handler not registered');
  return { handler, rpc, createClient };
}

describe('admin server access', () => {
  it('uses the identical existing stats query with valid hub or ordinary login, no cookies', async () => {
    const { handler, rpc } = endpoint();
    const hub = await handler(new Request('https://fixture.invalid', { headers: { 'x-hub-token': sign(Date.now() + 60_000) } }));
    const ordinary = await handler(new Request('https://fixture.invalid', { headers: { 'x-admin-key': 'ordinary-public-fixture' } }));
    expect(hub.status).toBe(200);
    expect(ordinary.status).toBe(200);
    expect(await hub.json()).toEqual(await ordinary.json());
    expect(rpc.mock.calls).toEqual([
      ['admin_daily_stats_v8', { _start: '2026-11-01' }],
      ['admin_daily_stats_v8', { _start: '2026-11-01' }],
    ]);
    expect(hub.headers.get('set-cookie')).toBeNull();
  });
  it('reverifies each request and refuses expired tokens before accessing data', async () => {
    const { handler, createClient } = endpoint();
    const exp = Date.now() + 60_000;
    const token = sign(exp);
    const request = () => new Request('https://fixture.invalid', { headers: { 'x-hub-token': token } });
    expect((await handler(request())).status).toBe(200);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(exp);
    try { expect((await handler(request())).status).toBe(401); }
    finally { clock.mockRestore(); }
    expect(createClient).toHaveBeenCalledTimes(1);
  });
  it('rejects bad hub signatures even if a valid ordinary key is also supplied', async () => {
    const { handler, createClient } = endpoint();
    const response = await handler(new Request('https://fixture.invalid', {
      headers: { 'x-hub-token': `${Date.now() + 60_000}.${'0'.repeat(64)}`, 'x-admin-key': 'ordinary-public-fixture' },
    }));
    expect(response.status).toBe(401);
    expect(createClient).not.toHaveBeenCalled();
  });
  it('allows the hub header on preflight without accessing data', async () => {
    const { handler, createClient } = endpoint();
    const response = await handler(new Request('https://fixture.invalid', { method: 'OPTIONS' }));
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-headers')?.split(',').map(s => s.trim())).toContain('x-hub-token');
    expect(createClient).not.toHaveBeenCalled();
  });
});