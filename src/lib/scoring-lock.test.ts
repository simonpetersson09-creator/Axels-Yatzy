import { afterAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
const url = process.env.SUPABASE_DB_URL;
const db = url ? postgres(url, { max: 1, prepare: false }) : null;
afterAll(async () => { if (db) await db.end(); });
describe.skipIf(!url)('deployed atomic expected-dice validation (read only)', () => {
  it('locks the game before comparing expected dice and retains service-only access', async () => {
    if (!db) throw new Error('Missing test connection');
    const [row] = await db`select pg_get_functiondef('public.perform_submit_score_authed(uuid,text,text,text,integer[])'::regprocedure) definition,
      has_function_privilege('anon','public.perform_submit_score_authed(uuid,text,text,text,integer[])','EXECUTE') anon_access,
      has_function_privilege('authenticated','public.perform_submit_score_authed(uuid,text,text,text,integer[])','EXECUTE') auth_access,
      has_function_privilege('service_role','public.perform_submit_score_authed(uuid,text,text,text,integer[])','EXECUTE') service_access`;
    expect(row.definition).toMatch(/SELECT dice INTO v_dice FROM public\.games WHERE id = p_game_id FOR UPDATE;/);
    expect(row.anon_access).toBe(false); expect(row.auth_access).toBe(false); expect(row.service_access).toBe(true);
  });
});