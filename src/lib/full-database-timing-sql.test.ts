import postgres from 'postgres';
import { afterAll, expect, it } from 'vitest';

const db = process.env.SUPABASE_DB_URL ? postgres(process.env.SUPABASE_DB_URL, { max: 1, prepare: false }) : null;
afterAll(async () => { await db?.end(); });

it.skipIf(!db)('measures the full diagnosed action and persists correlated private receipts without extra mutations', async () => {
  if (!db) throw new Error('Missing test connection');
  await db.begin(async sql => {
    await sql.unsafe(`
      CREATE TEMP TABLE session_owners(session_id text PRIMARY KEY,device_id text) ON COMMIT DROP;
      CREATE TEMP TABLE multiplayer_request_timings(attempt_id uuid,session_id text REFERENCES session_owners ON DELETE CASCADE,operation text,server_ms numeric,success boolean,db_statement_ms numeric,db_entry_ms numeric,db_action_ms numeric) ON COMMIT DROP;
      CREATE TEMP TABLE games(id uuid,rolls_left integer,dice integer[],round integer,current_player_index integer) ON COMMIT DROP;
      CREATE TEMP TABLE action_calls(operation text) ON COMMIT DROP;
      INSERT INTO session_owners VALUES('fixture','fixture-device');
      INSERT INTO games VALUES('00000000-0000-0000-0000-000000000001',2,ARRAY[6,6,6,6,6],1,0);
      CREATE FUNCTION pg_temp.fixture_roll(uuid,text,text,boolean[]) RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN
        PERFORM pg_sleep(0.04); INSERT INTO pg_temp.action_calls VALUES('roll');
        RETURN '{"success":true,"server_ms":1,"dice":[6,6,6,6,6],"rolls_left":2}'::jsonb;
      END $$;
      CREATE FUNCTION pg_temp.fixture_lock(uuid,text,text,boolean[],integer,integer,integer) RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN
        PERFORM pg_sleep(0.04); INSERT INTO pg_temp.action_calls VALUES('lock');
        RETURN '{"success":true,"server_ms":1}'::jsonb;
      END $$;
      CREATE FUNCTION pg_temp.fixture_score(uuid,text,text,text,integer[]) RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN
        PERFORM pg_sleep(0.04); INSERT INTO pg_temp.action_calls VALUES('score');
        RETURN '{"success":true,"score":50}'::jsonb;
      END $$;
    `);
    for (const signature of ['internal_database_timing(jsonb,timestamptz)', 'internal_record_request_timing(uuid,text,text,text,jsonb)',
      'client_roll_diagnosed(uuid,text,text,boolean[],uuid,integer)', 'client_set_locks_diagnosed(uuid,text,text,boolean[],integer,integer,integer,uuid)',
      'client_submit_score_diagnosed(uuid,text,text,text,integer[],uuid)']) {
      const [row] = await sql`SELECT pg_get_functiondef(('public.' || ${signature})::regprocedure) AS definition`;
      await sql.unsafe(row.definition.replace(/public\./g, 'pg_temp.')
        .replace(/pg_temp\.client_roll\(/g, 'pg_temp.fixture_roll(')
        .replace(/pg_temp\.client_set_locks_guarded\(/g, 'pg_temp.fixture_lock(')
        .replace(/pg_temp\.client_submit_score\(/g, 'pg_temp.fixture_score(')
        .replace(/SET search_path TO 'public'/g, "SET search_path TO 'pg_temp'"));
    }
    const calls = [
      "pg_temp.client_roll_diagnosed('00000000-0000-0000-0000-000000000001','fixture','fixture-device',NULL,'00000000-0000-0000-0000-000000000002',2)",
      "pg_temp.client_set_locks_diagnosed('00000000-0000-0000-0000-000000000001','fixture','fixture-device',NULL,1,2,0,'00000000-0000-0000-0000-000000000003')",
      "pg_temp.client_submit_score_diagnosed('00000000-0000-0000-0000-000000000001','fixture','fixture-device','yatzy',NULL,'00000000-0000-0000-0000-000000000004')",
    ];
    for (const call of calls) {
      const [row] = await sql.unsafe(`SELECT ${call} AS result`);
      expect(row.result.success).toBe(true);
      expect(row.result.db_action_ms).toBeGreaterThanOrEqual(40);
      expect(row.result.db_statement_ms).toBeGreaterThanOrEqual(row.result.db_action_ms);
      expect(row.result.db_entry_ms + row.result.db_action_ms).toBeCloseTo(row.result.db_statement_ms, 2);
    }
    const [stale] = await sql.unsafe(`SELECT pg_temp.client_roll_diagnosed('00000000-0000-0000-0000-000000000001','fixture','fixture-device',NULL,'00000000-0000-0000-0000-000000000005',3) AS result`);
    expect(stale.result).toMatchObject({ success: false, stale_roll: true, rolls_left: 2 });
    expect(stale.result.db_action_ms).toBeGreaterThanOrEqual(0);
    expect((await sql`SELECT operation FROM pg_temp.action_calls ORDER BY operation`).map(r => r.operation)).toEqual(['lock','roll','score']);
    const receipts = await sql`SELECT * FROM pg_temp.multiplayer_request_timings`;
    expect(receipts).toHaveLength(4);
    expect(receipts.every(r => Number(r.db_statement_ms) >= 0 && Number(r.db_action_ms) >= 0)).toBe(true);
    await sql.unsafe(`SELECT pg_temp.internal_record_request_timing('00000000-0000-0000-0000-000000000006','fixture','wrong-device','roll','{"success":true,"db_action_ms":100}')`);
    expect((await sql`SELECT count(*)::int AS n FROM pg_temp.multiplayer_request_timings`)[0].n).toBe(4);
    await sql`DELETE FROM pg_temp.session_owners WHERE session_id='fixture'`;
    expect((await sql`SELECT count(*)::int AS n FROM pg_temp.multiplayer_request_timings`)[0].n).toBe(0);
  });
});