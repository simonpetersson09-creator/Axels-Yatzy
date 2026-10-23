// Exercise the deployed SQL in transaction-local copies; no live seats or push triggers.
import { afterAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';

const url = process.env.SUPABASE_DB_URL;
const db = url ? postgres(url, { max: 1, prepare: false }) : null;
afterAll(async () => { if (db) await db.end(); });

async function isolated(check: (sql: postgres.TransactionSql) => Promise<void>) {
  if (!db) throw new Error('Database test connection missing');
  await db.begin(async sql => {
    for (const table of ['waiting_room_seats', 'waiting_room_push_queue', 'session_owners', 'push_tokens', 'rate_limits']) {
      await sql.unsafe(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES) ON COMMIT DROP`);
    }
    await sql.unsafe('CREATE OR REPLACE FUNCTION pg_temp.internal_waiting_room_reconcile() RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$');
    const [row] = await sql`SELECT pg_get_functiondef('public.internal_waiting_room_take_push()'::regprocedure) AS definition`;
    const definition = row.definition.replace('public.internal_waiting_room_take_push()', 'pg_temp.internal_waiting_room_take_push()')
      .replace("SET search_path TO 'public'", "SET search_path TO 'pg_temp', 'public'");
    await sql.unsafe(definition);
    await sql`INSERT INTO session_owners(session_id,device_id) VALUES('qa-cooldown-a','qa-cooldown-device'),('qa-cooldown-b','qa-cooldown-device'),('qa-cooldown-c','qa-other-device')`;
    await sql`INSERT INTO push_tokens(session_id,device_id,token,platform,enabled) VALUES('qa-cooldown-a','qa-cooldown-device','fake-a','ios',true),('qa-cooldown-b','qa-cooldown-device','fake-b','ios',true),('qa-cooldown-c','qa-other-device','fake-c','ios',true)`;
    await check(sql);
  });
}
async function enqueue(sql: postgres.TransactionSql, session = 'qa-cooldown-a', seat = 0) {
  const [row] = await sql`INSERT INTO waiting_room_seats(session_id,player_name,seat,present,ready,notify_enabled,recall_id,recall_until) VALUES(${session},'QA',${seat},false,false,true,gen_random_uuid(),now()+interval '120 seconds') RETURNING id,recall_id`;
  await sql`INSERT INTO waiting_room_push_queue(id,seat_id,expires_at) VALUES(${row.recall_id},${row.id},now()+interval '120 seconds')`;
  return row;
}
async function take(sql: postgres.TransactionSql) {
  const [row] = await sql`SELECT pg_temp.internal_waiting_room_take_push() AS job`;
  return row.job;
}
describe.skipIf(!url)('waiting-room device push cooldown (isolated deployed SQL)', () => {
  it('claims once and does not dispatch the same recall twice', () => isolated(async sql => {
    await enqueue(sql);
    expect((await take(sql)).device_id).toBe('qa-cooldown-device');
    expect(await take(sql)).toBeNull();
  }));
  it('blocks a new seat and session on the same device inside 15 minutes', () => isolated(async sql => {
    await enqueue(sql); expect(await take(sql)).not.toBeNull();
    await sql`DELETE FROM waiting_room_seats WHERE session_id='qa-cooldown-a'`;
    const next = await enqueue(sql, 'qa-cooldown-b');
    expect(await take(sql)).toBeNull();
    const [row] = await sql`SELECT dispatched_at FROM waiting_room_push_queue WHERE id=${next.recall_id}`;
    expect(row.dispatched_at).not.toBeNull();
  }));
  it('blocks at 14:59, permits a fresh recall at exactly 15:00, never replays suppressed jobs', () => isolated(async sql => {
    await sql`INSERT INTO rate_limits(key,last_request_at) VALUES('waiting_room_push:qa-cooldown-device',now()-interval '14 minutes 59 seconds')`;
    await enqueue(sql); expect(await take(sql)).toBeNull();
    await sql`UPDATE rate_limits SET last_request_at=now()-interval '15 minutes'`;
    expect(await take(sql)).toBeNull();
    await sql`DELETE FROM waiting_room_seats WHERE session_id='qa-cooldown-a'`;
    await enqueue(sql, 'qa-cooldown-b'); expect(await take(sql)).not.toBeNull();
  }));
  it('does not block other devices or use another notification category limit', () => isolated(async sql => {
    await sql`INSERT INTO rate_limits(key,last_request_at) VALUES('turn_push:qa-cooldown-device',now())`;
    await enqueue(sql); expect(await take(sql)).not.toBeNull();
    await enqueue(sql, 'qa-cooldown-c', 1); expect((await take(sql)).device_id).toBe('qa-other-device');
  }));
  it('never claims active, disabled, expired or tokenless recipients', () => isolated(async sql => {
    const row = await enqueue(sql);
    await sql`UPDATE waiting_room_seats SET present=true WHERE id=${row.id}`;
    expect(await take(sql)).toBeNull();
    await sql`UPDATE waiting_room_seats SET present=false,notify_enabled=false WHERE id=${row.id}`;
    expect(await take(sql)).toBeNull();
    await sql`UPDATE waiting_room_seats SET notify_enabled=true,recall_until=now() WHERE id=${row.id}`;
    expect(await take(sql)).toBeNull();
    await sql`UPDATE waiting_room_seats SET recall_until=now()+interval '120 seconds' WHERE id=${row.id}`;
    await sql`UPDATE push_tokens SET enabled=false`;
    expect(await take(sql)).toBeNull();
    const [counts] = await sql`SELECT count(*)::int AS n FROM rate_limits`;
    expect(counts.n).toBe(0);
  }));
});