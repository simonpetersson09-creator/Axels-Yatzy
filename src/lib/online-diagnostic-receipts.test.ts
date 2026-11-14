import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';

const db = process.env.SUPABASE_DB_URL ? postgres(process.env.SUPABASE_DB_URL, { max: 1, prepare: false }) : null;
afterAll(async () => { await db?.end(); });
const source = readFileSync('drizzle/migrations/0131_durable_online_issue_receipts_and_score_timing.sql', 'utf8');
const functions = source.match(/CREATE OR REPLACE FUNCTION[\s\S]*?\$function\$;/g) ?? [];

describe.skipIf(!db)('online diagnostic server contracts in isolated temporary tables', () => {
  async function fixture(run: (sql: postgres.TransactionSql) => Promise<void>) {
    if (!db) throw new Error('Missing SQL test connection');
    await db.begin(async sql => {
      await sql.unsafe(`
        CREATE TEMP TABLE session_owners(device_id text) ON COMMIT DROP;
        CREATE TEMP TABLE analytics_events(event_name text,session_id text,device_id text,local_user_id text,auth_user_id text,game_id text,game_mode text,metadata jsonb,platform text,app_version text,delivery_event_id text,UNIQUE(device_id,event_name,delivery_event_id)) ON COMMIT DROP;
        INSERT INTO pg_temp.session_owners VALUES ('test-device'),('other-device');
        CREATE TEMP TABLE score_calls(attempt_id uuid,operation text CHECK(operation IN ('roll','lock','score')),result jsonb) ON COMMIT DROP;
        CREATE OR REPLACE FUNCTION pg_temp.client_submit_score(uuid,text,text,text,integer[]) RETURNS jsonb LANGUAGE sql AS 'SELECT jsonb_build_object(''success'',true,''score'',12)';
        CREATE OR REPLACE FUNCTION pg_temp.internal_record_request_timing(uuid,text,text,text,jsonb) RETURNS void LANGUAGE sql AS 'INSERT INTO pg_temp.score_calls VALUES ($1,$4,$5)';
      `);
      for (const fn of functions) await sql.unsafe(fn.replace(/public\./g, 'pg_temp.').replace(/SET search_path TO 'public'/g, "SET search_path TO 'pg_temp'").replace('(SELECT auth.uid()::text)', 'NULL::text'));
      await run(sql);
    });
  }
  it('counts an ambiguously delivered report once, including duplicates in a batch', async () => {
    await fixture(async sql => {
      const event = { event_name: 'mp_issue', metadata: { event_id: 'same-id', kind: 'lock_failed' }, platform: 'ios' };
      const batch = JSON.stringify([event,event]);
      await sql.unsafe(`select pg_temp.log_analytics_events('test-device','${batch}'::jsonb)`);
      await sql.unsafe(`select pg_temp.log_analytics_events('test-device','${batch}'::jsonb)`);
      const [row] = await sql`select count(*)::int n from pg_temp.analytics_events`;
      expect(row.n).toBe(1);
    });
  });
  it('does not merge different devices, event kinds or legacy reports without IDs', async () => {
    await fixture(async sql => {
      for (const [device,event] of [['test-device','mp_issue'],['other-device','mp_issue'],['test-device','play_roll_timing']]) {
        await sql.unsafe(`select pg_temp.log_analytics_events('${device}','${JSON.stringify([{event_name:event,metadata:{event_id:'same-id'}}])}'::jsonb)`);
      }
      await sql`select pg_temp.log_analytics_events('test-device','[{"event_name":"mp_issue"},{"event_name":"mp_issue"}]'::jsonb)`;
      const [row] = await sql`select count(*)::int n from pg_temp.analytics_events`;
      expect(row.n).toBe(5);
    });
  });
  it('preserves device admission checks', async () => {
    await fixture(async sql => {
      await sql`select pg_temp.log_analytics_events('unknown','[{"event_name":"mp_issue"}]'::jsonb)`;
      const [row] = await sql`select count(*)::int n from pg_temp.analytics_events`;
      expect(row.n).toBe(0);
    });
  });
  it('returns the original score and records exactly one correlated score timing', async () => {
    await fixture(async sql => {
      const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      const [row] = await sql`select pg_temp.client_submit_score_diagnosed(${id}::uuid,'player','test-device','fours',ARRAY[4,4,4,2,1],${id}::uuid) result`;
      expect(row.result).toMatchObject({success:true,score:12});
      expect(row.result.server_ms).toBeGreaterThanOrEqual(0);
      const calls = await sql`select attempt_id,operation from pg_temp.score_calls`;
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({attempt_id:id,operation:'score'});
    });
  });
});