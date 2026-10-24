// Run deployed functions against transaction-local tables, without live seats or triggers.
import { afterAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';

const url = process.env.SUPABASE_DB_URL;
const db = url ? postgres(url, { max: 1, prepare: false }) : null;
afterAll(async () => { if (db) await db.end(); });

async function isolated(check: (sql: postgres.TransactionSql, seat: string, game: string) => Promise<void>, status = 'finished') {
  if (!db) throw new Error('Database test connection missing');
  await db.begin(async sql => {
    for (const table of ['games', 'game_players', 'waiting_room_seats', 'waiting_room_state', 'waiting_room_push_queue', 'session_owners', 'push_tokens']) {
      await sql.unsafe(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES) ON COMMIT DROP`);
    }
    for (const name of ['claim_session', 'internal_waiting_room_reconcile', 'waiting_room_action']) {
      const [row] = await sql`SELECT pg_get_functiondef(oid) AS definition FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=${name}`;
      const definition = row.definition.replace(`public.${name}(`, `pg_temp.${name}(`)
        .replace("SET search_path TO 'public'", "SET search_path TO 'pg_temp', 'public'")
        .replaceAll('public.session_owners', 'pg_temp.session_owners')
        .replaceAll('claim_session(p_session_id,p_device_id)', 'pg_temp.claim_session(p_session_id,p_device_id)')
        .replaceAll('PERFORM internal_waiting_room_reconcile()', 'PERFORM pg_temp.internal_waiting_room_reconcile()');
      await sql.unsafe(definition);
    }
    const [game] = await sql`INSERT INTO games(game_code,status) VALUES('QAONLY',${status}::public.game_status) RETURNING id`;
    const [seat] = await sql`INSERT INTO waiting_room_seats(session_id,player_name,seat,game_id,matched_at,present,ready) VALUES('qa-reentry','QA',0,${game.id},now(),false,false) RETURNING id`;
    await sql`INSERT INTO waiting_room_seats(session_id,player_name,seat,present,ready) VALUES('qa-other','Other',0,false,false)`;
    await check(sql, seat.id, game.id);
  });
}

describe.skipIf(!url)('waiting-room reentry (isolated deployed SQL)', () => {
  it('finished match cannot redirect a saved waiting seat back into the old game', () => isolated(async (sql, seat) => {
    const [row] = await sql`SELECT pg_temp.waiting_room_action('qa-reentry','qa-device','open',${seat}::uuid) AS result`;
    expect(row.result.error).toBe('expired');
    expect(row.result.mine).toBeNull();
    const [other] = await sql`SELECT session_id,present,ready FROM waiting_room_seats WHERE session_id='qa-other'`;
    expect(other).toEqual({ session_id: 'qa-other', present: false, ready: false });
  }));
  it('explicit join after a finished match takes a new waiting seat', () => isolated(async (sql, seat) => {
    await sql`SELECT pg_temp.waiting_room_action('qa-reentry','qa-device','open',${seat}::uuid)`;
    const [row] = await sql`SELECT pg_temp.waiting_room_action('qa-reentry','qa-device','join') AS result`;
    expect(row.result.error).toBeNull();
    expect(row.result.mine.id).not.toBe(seat);
    expect(row.result.mine.game_id).toBeNull();
    expect(row.result.mine.present).toBe(true);
    expect(row.result.mine.seat).toBe(1);
  }));
  it('active match handoff still returns the same game', () => isolated(async (sql, seat, game) => {
    const [row] = await sql`SELECT pg_temp.waiting_room_action('qa-reentry','qa-device','open',${seat}::uuid) AS result`;
    expect(row.result.error).toBeNull();
    expect(row.result.mine.game_id).toBe(game);
  }, 'playing'));
});