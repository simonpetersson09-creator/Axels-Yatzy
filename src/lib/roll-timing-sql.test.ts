import postgres from 'postgres';
import { afterAll, expect, it } from 'vitest';

const db = process.env.SUPABASE_DB_URL ? postgres(process.env.SUPABASE_DB_URL, { max: 1, prepare: false }) : null;
afterAll(async () => { await db?.end(); });

it.skipIf(!db)('server duration preserves the result and device validation without an extra roll', async () => {
  if (!db) throw new Error('Missing test connection');
  await db.begin(async sql => {
    await sql.unsafe(`
      CREATE TEMP TABLE roll_calls(n integer) ON COMMIT DROP;
      CREATE OR REPLACE FUNCTION pg_temp.perform_lock_and_roll_authed(uuid,text,text,boolean[]) RETURNS jsonb LANGUAGE plpgsql AS $$
      BEGIN
        INSERT INTO pg_temp.roll_calls VALUES (1);
        IF $3 <> 'valid-device' THEN RETURN '{"success":false,"auth_failed":true}'::jsonb; END IF;
        PERFORM pg_sleep(0.02);
        RETURN '{"success":true,"dice":[1,2,3,4,5],"rolls_left":2}'::jsonb;
      END $$;
    `);
    const [definition] = await sql`SELECT pg_get_functiondef('public.client_roll(uuid,text,text,boolean[])'::regprocedure) AS definition`;
    await sql.unsafe(definition.definition.replace(/public\./g, 'pg_temp.').replace(/SET search_path TO 'public'/g, "SET search_path TO 'pg_temp'"));
    const [ok] = await sql.unsafe("SELECT pg_temp.client_roll('00000000-0000-0000-0000-000000000001','player','valid-device',ARRAY[false,false,false,false,false]) AS result");
    expect(ok.result).toMatchObject({ success: true, dice: [1,2,3,4,5], rolls_left: 2 });
    expect(ok.result.server_ms).toBeGreaterThanOrEqual(20);
    expect((await sql`SELECT count(*)::int AS n FROM pg_temp.roll_calls`)[0].n).toBe(1);
    const [missing] = await sql.unsafe("SELECT pg_temp.client_roll('00000000-0000-0000-0000-000000000001','player',NULL,NULL) AS result");
    expect(missing.result).toMatchObject({ success: false, auth_failed: true });
    const [invalid] = await sql.unsafe("SELECT pg_temp.client_roll('00000000-0000-0000-0000-000000000001','player','valid-device',ARRAY[false]) AS result");
    expect(invalid.result).toMatchObject({ success: false, error: 'locked[5] required' });
    expect((await sql`SELECT count(*)::int AS n FROM pg_temp.roll_calls`)[0].n).toBe(1);
    const [refused] = await sql.unsafe("SELECT pg_temp.client_roll('00000000-0000-0000-0000-000000000001','player','wrong-device',NULL) AS result");
    expect(refused.result).toMatchObject({ success: false, auth_failed: true });
  });
});