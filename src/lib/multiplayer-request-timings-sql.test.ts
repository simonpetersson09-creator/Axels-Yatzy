import postgres from 'postgres';
import { afterAll, expect, it } from 'vitest';
const db = process.env.SUPABASE_DB_URL ? postgres(process.env.SUPABASE_DB_URL, { max: 1, prepare: false }) : null;
afterAll(async () => { await db?.end(); });
it.skipIf(!db)('durable receipts preserve one action, reject another device and cascade owner deletion', async () => {
  if (!db) throw new Error('Missing test connection');
  await db.begin(async sql => {
    await sql.unsafe(`
      CREATE TEMP TABLE session_owners(session_id text PRIMARY KEY,device_id text) ON COMMIT DROP;
      CREATE TEMP TABLE multiplayer_request_timings(request_id uuid DEFAULT gen_random_uuid(),attempt_id uuid,session_id text REFERENCES session_owners(session_id) ON DELETE CASCADE,operation text,recorded_at timestamptz DEFAULT clock_timestamp(),server_ms numeric,success boolean) ON COMMIT DROP;
      CREATE TEMP TABLE action_calls(operation text) ON COMMIT DROP;
      INSERT INTO session_owners VALUES('player','valid-device');
      CREATE FUNCTION pg_temp.client_roll(uuid,text,text,boolean[]) RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN
        INSERT INTO pg_temp.action_calls VALUES('roll'); RETURN '{"success":true,"server_ms":2,"dice":[6,6,6,6,6],"rolls_left":2}'::jsonb;
      END $$;
      CREATE FUNCTION pg_temp.client_set_locks_guarded(uuid,text,text,boolean[],integer,integer,integer) RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN
        INSERT INTO pg_temp.action_calls VALUES('lock'); RETURN '{"success":false,"stale_command":true,"server_ms":3}'::jsonb;
      END $$;
    `);
    for (const signature of ['internal_record_request_timing(uuid,text,text,text,jsonb)', 'client_roll_diagnosed(uuid,text,text,boolean[],uuid)', 'client_set_locks_diagnosed(uuid,text,text,boolean[],integer,integer,integer,uuid)']) {
      const [row] = await sql`SELECT pg_get_functiondef(('public.' || ${signature})::regprocedure) AS definition`;
      await sql.unsafe(row.definition.replace(/public\./g, 'pg_temp.').replace(/SET search_path TO 'public'/g, "SET search_path TO 'pg_temp'"));
    }
    const [roll] = await sql.unsafe(`SELECT pg_temp.client_roll_diagnosed('00000000-0000-0000-0000-000000000001','player','valid-device',NULL,'00000000-0000-0000-0000-000000000002') AS result`);
    expect(roll.result).toEqual({ success: true, server_ms: 2, dice: [6,6,6,6,6], rolls_left: 2 });
    const [lock] = await sql.unsafe(`SELECT pg_temp.client_set_locks_diagnosed('00000000-0000-0000-0000-000000000001','player','valid-device',NULL,1,2,0,'00000000-0000-0000-0000-000000000003') AS result`);
    expect(lock.result).toEqual({ success: false, stale_command: true, server_ms: 3 });
    expect((await sql`SELECT operation FROM pg_temp.action_calls ORDER BY operation`).map(r => r.operation)).toEqual(['lock','roll']);
    expect((await sql`SELECT operation,server_ms,success FROM pg_temp.multiplayer_request_timings ORDER BY operation`)).toMatchObject([{ operation: 'lock', server_ms: '3', success: false }, { operation: 'roll', server_ms: '2', success: true }]);
    await sql.unsafe(`SELECT pg_temp.internal_record_request_timing('00000000-0000-0000-0000-000000000004','player','wrong-device','roll','{"success":true,"server_ms":1}')`);
    expect((await sql`SELECT count(*)::int AS n FROM pg_temp.multiplayer_request_timings`)[0].n).toBe(2);
    await sql`DELETE FROM pg_temp.session_owners WHERE session_id='player'`;
    expect((await sql`SELECT count(*)::int AS n FROM pg_temp.multiplayer_request_timings`)[0].n).toBe(0);
  });
});
it.skipIf(!db)('server receipts are private and purged daily after 30 days', async () => {
  if (!db) throw new Error('Missing test connection');
  const [access] = await db`SELECT has_table_privilege('anon','public.multiplayer_request_timings','SELECT') AS anon,has_table_privilege('authenticated','public.multiplayer_request_timings','INSERT') AS authenticated,has_table_privilege('service_role','public.multiplayer_request_timings','SELECT') AS service`;
  expect(access).toMatchObject({ anon: false, authenticated: false, service: true });
  const [job] = await db`SELECT schedule,command,active FROM cron.job WHERE jobname='purge-multiplayer-request-timings'`;
  expect(job).toMatchObject({ schedule: '23 3 * * *', active: true });
  expect(job.command).toBe("DELETE FROM public.multiplayer_request_timings WHERE recorded_at < now() - interval '30 days'");
});