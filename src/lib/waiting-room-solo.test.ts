// Exercise deployed rules in temporary tables, never the shared waiting room.
import { afterAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';

const url = process.env.SUPABASE_DB_URL;
const db = url ? postgres(url, { max: 1, prepare: false }) : null;
afterAll(async () => { await db?.end(); });

async function isolated(check: (sql: postgres.TransactionSql) => Promise<void>) {
  if (!db) throw new Error('Database test connection missing');
  await db.begin(async sql => {
    for (const table of ['games', 'game_players', 'waiting_room_seats', 'waiting_room_state', 'waiting_room_push_queue', 'session_owners', 'push_tokens']) {
      await sql.unsafe(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES) ON COMMIT DROP`);
    }
    for (const name of ['claim_session', 'internal_waiting_room_reconcile', 'waiting_room_action']) {
      const [row] = await sql`SELECT pg_get_functiondef(oid) AS definition FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=${name}`;
      await sql.unsafe(row.definition.replace(`public.${name}(`, `pg_temp.${name}(`)
        .replace("SET search_path TO 'public'", "SET search_path TO 'pg_temp', 'public'")
        .replaceAll('public.session_owners', 'pg_temp.session_owners')
        .replaceAll('claim_session(p_session_id,p_device_id)', 'pg_temp.claim_session(p_session_id,p_device_id)')
        .replaceAll('PERFORM internal_waiting_room_reconcile()', 'PERFORM pg_temp.internal_waiting_room_reconcile()'));
    }
    await sql`INSERT INTO waiting_room_seats(session_id,player_name,seat,present,ready,last_seen_at,joined_at,solo_until)
      VALUES('solo-review','Solo',2,false,false,now()-interval '1 hour',now()-interval '1 hour',now()+interval '1 hour')`;
    await check(sql);
  });
}

describe.skipIf(!url)('two-hour solo deadline (isolated deployed SQL)', () => {
  it('keeps the seat at 1:59:59 and releases it at exactly two hours', () => isolated(async sql => {
    await sql`UPDATE waiting_room_seats SET solo_until=now()+interval '1 second'`;
    await sql`SELECT pg_temp.internal_waiting_room_reconcile()`;
    const [before] = await sql`SELECT count(*)::int AS n FROM waiting_room_seats`;
    expect(before.n).toBe(1);
    await sql`UPDATE waiting_room_seats SET solo_until=now()`;
    await sql`SELECT pg_temp.internal_waiting_room_reconcile()`;
    const [after] = await sql`SELECT count(*)::int AS n FROM waiting_room_seats`;
    expect(after.n).toBe(0);
  }));
  it('initializes legacy seats from last activity, not the current read', () => isolated(async sql => {
    await sql`UPDATE waiting_room_seats SET solo_until=NULL`;
    await sql`SELECT pg_temp.internal_waiting_room_reconcile()`;
    const [row] = await sql`SELECT extract(epoch FROM solo_until-now())::int AS remaining FROM waiting_room_seats`;
    expect(row.remaining).toBe(3600);
  }));
  it('home sync and away do not extend the two-hour deadline', () => isolated(async sql => {
    for (const action of ['sync', 'away']) {
      await sql`SELECT pg_temp.waiting_room_action('solo-review','solo-device',${action})`;
      const [row] = await sql`SELECT extract(epoch FROM solo_until-now())::int AS remaining FROM waiting_room_seats`;
      expect(row.remaining).toBe(3600);
    }
  }));
  it('foreground heartbeat renews exactly 7200 seconds', () => isolated(async sql => {
    await sql`SELECT pg_temp.waiting_room_action('solo-review','solo-device','heartbeat')`;
    const [row] = await sql`SELECT present,extract(epoch FROM solo_until-now())::int AS remaining FROM waiting_room_seats`;
    expect(row).toEqual({ present: true, remaining: 7200 });
  }));
  it('another player clears solo expiry and applies the 120-second ready deadline', () => isolated(async sql => {
    await sql`INSERT INTO waiting_room_seats(session_id,player_name,seat,present,ready) VALUES('second-review','Second',0,true,false)`;
    await sql`SELECT pg_temp.internal_waiting_room_reconcile()`;
    const rows = await sql`SELECT solo_until,extract(epoch FROM recall_until-now())::int AS remaining FROM waiting_room_seats`;
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row).toEqual({ solo_until: null, remaining: 120 });
  }));
});