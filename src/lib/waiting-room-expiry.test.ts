// Real deployed functions, transaction-local tables only: no shared seats or games.
import { afterAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';

const url = process.env.SUPABASE_DB_URL;
const db = url ? postgres(url, { max: 1, prepare: false }) : null;
afterAll(async () => { await db?.end(); });

async function isolated(check: (sql: postgres.TransactionSql) => Promise<void>) {
  if (!db) throw new Error('Missing test connection');
  await db.begin(async sql => {
    for (const table of ['games', 'game_players', 'waiting_room_seats', 'waiting_room_state', 'waiting_room_push_queue', 'session_owners', 'push_tokens']) {
      await sql.unsafe(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES) ON COMMIT DROP`);
    }
    await sql`CREATE TEMP TABLE waiting_room_expiry_notices(session_id text PRIMARY KEY REFERENCES session_owners(session_id) ON DELETE CASCADE,id uuid DEFAULT gen_random_uuid(),seat_id uuid,player_names text,created_at timestamptz DEFAULT now()) ON COMMIT DROP`;
    for (const name of ['claim_session', 'internal_waiting_room_reconcile', 'waiting_room_action', 'waiting_room_count', 'ack_waiting_room_expiry']) {
      const [row] = await sql`SELECT pg_get_functiondef(oid) AS definition FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=${name}`;
      if (!row) continue;
      await sql.unsafe(row.definition.replace(`public.${name}(`, `pg_temp.${name}(`)
        .replace("SET search_path TO 'public'", "SET search_path TO 'pg_temp', 'public'")
        .replaceAll('public.session_owners', 'pg_temp.session_owners')
        .replaceAll('claim_session(p_session_id,p_device_id)', 'pg_temp.claim_session(p_session_id,p_device_id)')
        .replaceAll('PERFORM internal_waiting_room_reconcile()', 'PERFORM pg_temp.internal_waiting_room_reconcile()'));
    }
    await sql`SELECT pg_temp.claim_session('absent','absent-device'),pg_temp.claim_session('present','present-device')`;
    await sql`INSERT INTO waiting_room_seats(session_id,player_name,seat,present,ready,recall_until)
      VALUES('absent','Alicia',2,false,false,now()),('present','Simon',0,true,false,now())`;
    await check(sql);
  });
}

describe.skipIf(!url)('only missing waiting-room players expire', () => {
  it('removes only the absent player at 120 seconds, keeping a present nonready player', () => isolated(async sql => {
    await sql`SELECT pg_temp.internal_waiting_room_reconcile()`;
    expect(await sql`SELECT session_id,ready,recall_until FROM waiting_room_seats`).toEqual([{ session_id: 'present', ready: false, recall_until: null }]);
  }));
  it('retains the absent player at 119 seconds and removes them at 120', () => isolated(async sql => {
    await sql`UPDATE waiting_room_seats SET recall_until=now()+interval '1 second' WHERE session_id='absent'`;
    await sql`SELECT pg_temp.internal_waiting_room_reconcile()`;
    expect((await sql`SELECT count(*)::int n FROM waiting_room_seats`)[0].n).toBe(2);
    await sql`UPDATE waiting_room_seats SET recall_until=now() WHERE session_id='absent'`;
    await sql`SELECT pg_temp.internal_waiting_room_reconcile()`;
    expect((await sql`SELECT count(*)::int n FROM waiting_room_seats`)[0].n).toBe(1);
  }));
  it('stores the missed player name, privately returns it after restart and acknowledges exactly that notice', () => isolated(async sql => {
    await sql`SELECT pg_temp.internal_waiting_room_reconcile()`;
    const [first] = await sql`SELECT pg_temp.waiting_room_action('absent','absent-device','sync') result`;
    expect(first.result.expiry_notice.player_names).toBe('Simon');
    const [again] = await sql`SELECT pg_temp.waiting_room_action('absent','absent-device','sync') result`;
    expect(again.result.expiry_notice.id).toBe(first.result.expiry_notice.id);
    const [other] = await sql`SELECT pg_temp.waiting_room_action('present','present-device','sync') result`;
    expect(other.result.expiry_notice).toBeNull();
    await sql`SELECT pg_temp.ack_waiting_room_expiry('present','present-device',${first.result.expiry_notice.id}::uuid)`;
    expect((await sql`SELECT count(*)::int n FROM waiting_room_expiry_notices`)[0].n).toBe(1);
    await sql`SELECT pg_temp.ack_waiting_room_expiry('absent','absent-device',${first.result.expiry_notice.id}::uuid)`;
    expect((await sql`SELECT count(*)::int n FROM waiting_room_expiry_notices`)[0].n).toBe(0);
  }));
  it('allows timely return without Ready and prevents expiry on another heartbeat', () => isolated(async sql => {
    await sql`UPDATE waiting_room_seats SET recall_until=now()+interval '1 second' WHERE session_id='absent'`;
    const [returned] = await sql`SELECT pg_temp.waiting_room_action('absent','absent-device','open') result`;
    expect(returned.result.mine.present).toBe(true);
    expect(returned.result.mine.ready).toBe(false);
    expect(returned.result.mine.recall_until).toBeNull();
    await sql`UPDATE waiting_room_seats SET recall_until=now() WHERE session_id='absent'`;
    const [next] = await sql`SELECT pg_temp.waiting_room_action('absent','absent-device','heartbeat') result`;
    expect(next.result.players).toHaveLength(2);
    expect(next.result.countdown_at).toBeNull();
  }));
  it('gives a new absence exactly 120 seconds without resetting it on sync', () => isolated(async sql => {
    await sql`UPDATE waiting_room_seats SET present=true,recall_until=NULL`;
    const [away] = await sql`SELECT pg_temp.waiting_room_action('absent','absent-device','away') result`;
    expect((Date.parse(away.result.mine.recall_until)-Date.parse(away.result.server_now))/1000).toBe(120);
    const [sync] = await sql`SELECT pg_temp.waiting_room_action('absent','absent-device','sync') result`;
    expect(sync.result.mine.recall_until).toBe(away.result.mine.recall_until);
    expect(sync.result.players.find((p: { session_id: string }) => p.session_id==='present').recall_until).toBeNull();
  }));
  it('late return cannot rejoin or create a match automatically', () => isolated(async sql => {
    const [seat] = await sql`SELECT id FROM waiting_room_seats WHERE session_id='absent'`;
    const [late] = await sql`SELECT pg_temp.waiting_room_action('absent','absent-device','open',${seat.id}::uuid) result`;
    expect(late.result.error).toBe('expired');
    expect(late.result.mine).toBeNull();
    expect(late.result.players).toHaveLength(1);
    expect((await sql`SELECT count(*)::int n FROM games`)[0].n).toBe(0);
  }));
  it('denies acknowledgement from the wrong device', () => isolated(async sql => {
    await sql`SELECT pg_temp.internal_waiting_room_reconcile()`;
    const [notice] = await sql`SELECT id FROM waiting_room_expiry_notices WHERE session_id='absent'`;
    await expect(sql.savepoint(async transaction => {
      await transaction`SELECT pg_temp.ack_waiting_room_expiry('absent','wrong-device',${notice.id}::uuid)`;
    })).rejects.toThrow('room_identity_denied');
    expect((await sql`SELECT count(*)::int n FROM waiting_room_expiry_notices`)[0].n).toBe(1);
  }));
  it('owner deletion removes the private receipt and the deployed table is locked', () => isolated(async sql => {
    const [policy] = await sql`SELECT c.relrowsecurity,pg_get_constraintdef(k.oid) definition FROM pg_class c JOIN pg_constraint k ON k.conrelid=c.oid AND k.contype='f' WHERE c.oid='public.waiting_room_expiry_notices'::regclass`;
    expect(policy.relrowsecurity).toBe(true);
    expect(policy.definition).toMatch(/REFERENCES (public\.)?session_owners\(session_id\) ON DELETE CASCADE/);
    await sql`SELECT pg_temp.internal_waiting_room_reconcile()`;
    await sql`DELETE FROM session_owners WHERE session_id='absent'`;
    expect((await sql`SELECT count(*)::int n FROM waiting_room_expiry_notices`)[0].n).toBe(0);
  }));
});