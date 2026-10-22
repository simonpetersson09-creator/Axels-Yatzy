// Real database functions; each scenario runs in a transaction and rolls back all QA data.
import { afterAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
const url = process.env.SUPABASE_DB_URL;
const db = url ? postgres(url, { max: 5, prepare: false }) : null;
afterAll(async () => { if (db) await db.end(); });
async function scenario(check: (sql: postgres.TransactionSql, ids: string[], action: (i: number, action?: string, seat?: string | null, ready?: boolean, notify?: boolean) => Promise<any>) => Promise<void>) {
  if (!db) throw new Error('Database test connection missing');
  const rollback = new Error('qa_rollback');
  try {
    await db.begin(async sql => {
      await sql`select pg_advisory_xact_lock(742001)`;
      const occupied = await sql`select count(*)::int as n from waiting_room_seats where game_id is null`;
      if (occupied[0].n !== 0) throw new Error('Real waiting players present: refusing QA interference');
      const ids = Array.from({ length: 5 }, () => `qa-room-${randomUUID()}`);
      const action = async (i: number, act = 'join', seat: string | null = null, ready = false, notify = false) => {
        const rows = await sql`select waiting_room_action(${ids[i]},${ids[i] + '-device'},${act},${seat}::uuid,${'QA '+i},${ready},${notify}) as result`;
        return rows[0].result;
      };
      await check(sql, ids, action);
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
}
describe.skipIf(!url)('authoritative waiting room database', () => {
  it('simultaneous joins compete for the last seat and simultaneous ready are serialized', async () => {
    if (!db) throw new Error('Database test connection missing');
    const occupied=await db`select count(*)::int n from waiting_room_seats where game_id is null`;
    if(occupied[0].n!==0) throw new Error('Real waiting players present: refusing QA interference');
    const ids=Array.from({length:5},()=>`qa-room-${randomUUID()}`);
    const seats=new Map<number,string>();
    const act=async(i:number,action='join',ready=false)=> {
      const rows=await db`select waiting_room_action(${ids[i]},${ids[i]+'-device'},${action},${seats.get(i)??null}::uuid,'QA concurrency',${ready},false) result`;
      if(rows[0].result.mine) seats.set(i,rows[0].result.mine.id);
      return rows[0].result;
    };
    try {
      for(let i=0;i<3;i++)await act(i);
      const joins=await Promise.all([act(3),act(4)]);
      expect(joins.filter(r=>r.error==='full').length).toBe(1);
      expect(seats.size).toBe(4);
      const ready=await Promise.all(Array.from(seats.keys()).map(i=>act(i,'ready',true)));
      expect(ready.filter(r=>r.countdown_at).length).toBe(1);
      expect(new Set(ready.flatMap(r=>r.players.map((p:any)=>p.id))).size).toBe(4);
    } finally {
      // Leave before the three-second deadline. No game or leaderboard data is produced.
      await Promise.all(Array.from(seats.keys()).map(i=>act(i,'leave')));
    }
  });
  it('gives unique seats, rejects fifth, prevents duplicate membership', () => scenario(async (sql, ids, action) => {
    for (let i = 0; i < 4; i++) expect((await action(i)).mine.seat).toBe(i);
    expect((await action(4)).error).toBe('full');
    expect((await action(0)).players.length).toBe(4);
  }));
  it('two ready start one game and leave no waiting participants', () => scenario(async (sql, ids, action) => {
    const a = await action(0), b = await action(1);
    expect((await action(0, 'ready', a.mine.id, true)).countdown_at).toBeNull();
    const ready = await action(1, 'ready', b.mine.id, true);
    expect(ready.countdown_at).toBeTruthy();
    expect((await action(2)).error).toBe('starting');
    await sql`update waiting_room_state set countdown_at=now()-interval '3 seconds' where id=1`;
    const one = await action(0, 'sync', a.mine.id), two = await action(1, 'sync', b.mine.id);
    expect(one.mine.game_id).toBeTruthy(); expect(two.mine.game_id).toBe(one.mine.game_id);
    expect((await action(0, 'ready', a.mine.id, true)).mine.game_id).toBe(one.mine.game_id);
    const games = await sql`select count(*)::int n from game_players where game_id=${one.mine.game_id}`;
    expect(games[0].n).toBe(2); expect(one.players.length).toBe(0);
  }));
  it('three and four require every participant ready', () => scenario(async (sql, ids, action) => {
    const seats = [];
    for (let i=0;i<4;i++) seats.push((await action(i)).mine.id);
    for (let i=0;i<3;i++) expect((await action(i,'ready',seats[i],true)).countdown_at).toBeNull();
    expect((await action(3,'ready',seats[3],true)).countdown_at).toBeTruthy();
  }));
  it('background retains seat, removes ready and cancels countdown', () => scenario(async (sql, ids, action) => {
    const a=await action(0),b=await action(1);
    await action(0,'ready',a.mine.id,true); await action(1,'ready',b.mine.id,true);
    const away=await action(0,'away',a.mine.id);
    expect(away.mine.expires_at).toBe(a.mine.expires_at); expect(away.mine.ready).toBe(false);
    expect(away.countdown_at).toBeNull(); expect(away.players.every((p:any)=>!p.ready)).toBe(true);
    expect(Math.round((Date.parse(away.mine.recall_until)-Date.parse(away.server_now))/1000)).toBe(120);
  }));
  it('missing heartbeats remove presence and ready without releasing seat', () => scenario(async (sql, ids, action) => {
    const a=await action(0); await action(0,'ready',a.mine.id,true);
    await sql`update waiting_room_seats set last_seen_at=now()-interval '26 seconds' where id=${a.mine.id}`;
    const out=await action(0,'sync',a.mine.id);
    expect(out.mine.present).toBe(false);expect(out.mine.ready).toBe(false);expect(out.mine.id).toBe(a.mine.id);
  }));
  it('recall is bounded, never extended by joins, deduplicated, cancelled when alone', () => scenario(async (sql, ids, action) => {
    const a=await action(0);await action(0,'notify',a.mine.id,false,true);await action(0,'away',a.mine.id);
    const b=await action(1);
    const first=b.players.find((p:any)=>p.id===a.mine.id);
    const c=await action(2);
    expect(c.players.find((p:any)=>p.id===a.mine.id).recall_until).toBe(first.recall_until);
    const counts=await sql`select count(*)::int n, max(extract(epoch from expires_at-now()))::int seconds from waiting_room_push_queue where seat_id=${a.mine.id}`;
    expect(counts[0].n).toBe(1);expect(counts[0].seconds).toBe(120);
    await action(1,'leave',b.mine.id);const alone=await action(2,'leave',c.mine.id);
    expect(alone.players[0].recall_until).toBeNull();
    const q=await sql`select count(*)::int n from waiting_room_push_queue where seat_id=${a.mine.id}`;expect(q[0].n).toBe(0);
  }));
  it('expiry and stale notification cannot resurrect old seat', () => scenario(async (sql, ids, action) => {
    const a=await action(0);await action(1);await sql`update waiting_room_seats set recall_until=now() where id=${a.mine.id}`;
    const old=await action(0,'open',a.mine.id);expect(old.error).toBe('expired');expect(old.mine).toBeNull();
    const fresh=await action(0);expect(fresh.mine.id).not.toBe(a.mine.id);
    expect((await action(0,'open',a.mine.id)).mine).toBeNull();
  }));
  it('device identity prevents other devices changing the seat', () => scenario(async (sql, ids, action) => {
    const a=await action(0);
    await expect(sql`select waiting_room_action(${ids[0]},'wrong-device','ready',${a.mine.id}::uuid,'attacker',true,false)`).rejects.toThrow('room_identity_denied');
  }));
  it('solo waiting survives the old 15-minute expiry and needs no extension', () => scenario(async (sql, ids, action) => {
    const a=await action(0);await sql`update waiting_room_seats set expires_at=now()+interval '1 minute' where id=${a.mine.id}`;
    await sql`update waiting_room_seats set expires_at=now()-interval '30 minutes' where id=${a.mine.id}`;
    const retained=await action(0,'heartbeat',a.mine.id);
    expect(retained.mine.id).toBe(a.mine.id);expect(retained.mine.recall_until).toBeNull();
  }));
  it('server indicator excludes own, expired, recalled and matched seats but includes absence', () => scenario(async (sql, ids, action) => {
    const a=await action(0), b=await action(1);
    await action(1,'away',b.mine.id);
    let n=await sql`select waiting_room_count(${ids[0]}) n`;expect(n[0].n).toBe(1);
    await sql`update waiting_room_seats set recall_until=now() where id=${b.mine.id}`;
    n=await sql`select waiting_room_count(${ids[0]}) n`;expect(n[0].n).toBe(0);
    await action(0,'heartbeat',a.mine.id);
    const c=await action(2);await sql`update waiting_room_seats set recall_until=now() where id=${c.mine.id}`;
    n=await sql`select waiting_room_count(${ids[0]}) n`;expect(n[0].n).toBe(0);
  }));
  it('three players start only after the third is ready', () => scenario(async (sql,ids,action) => {
    const seats=[];for(let i=0;i<3;i++)seats.push((await action(i)).mine.id);
    await action(0,'ready',seats[0],true);
    expect((await action(1,'ready',seats[1],true)).countdown_at).toBeNull();
    expect((await action(2,'ready',seats[2],true)).countdown_at).toBeTruthy();
  }));
  it('recall expiry releases a seat and cannot be revived by a heartbeat', () => scenario(async (sql,ids,action) => {
    const a=await action(0);await action(0,'away',a.mine.id);await action(1);
    await sql`update waiting_room_seats set recall_until=now() where id=${a.mine.id}`;
    const late=await action(0,'heartbeat',a.mine.id);expect(late.error).toBe('expired');expect(late.mine).toBeNull();
    expect(late.players.length).toBe(1);
  }));
  it('a departure cancels countdown even at its deadline before a match exists', () => scenario(async(sql,ids,action)=>{
    const a=await action(0),b=await action(1);
    await action(0,'ready',a.mine.id,true);await action(1,'ready',b.mine.id,true);
    await sql`update waiting_room_state set countdown_at=now()-interval '3 seconds' where id=1`;
    const away=await action(0,'away',a.mine.id);
    expect(away.mine.game_id).toBeNull();expect(away.countdown_at).toBeNull();
    expect(away.players.every((p:any)=>!p.ready)).toBe(true);
  }));
  it('company starts exactly 120 seconds for every nonready participant', () => scenario(async(sql,ids,action)=>{
    const a=await action(0);expect(a.mine.recall_until).toBeNull();
    const b=await action(1);
    for(const p of b.players)expect((Date.parse(p.recall_until)-Date.parse(b.server_now))/1000).toBe(120);
    const again=await action(0,'join',a.mine.id);
    expect(again.mine.recall_until).toBe(b.players.find((p:any)=>p.id===a.mine.id).recall_until);
  }));
  it('return and heartbeat do not extend the ready deadline', () => scenario(async(sql,ids,action)=>{
    const a=await action(0);await action(0,'away',a.mine.id);const b=await action(1);
    const deadline=b.players.find((p:any)=>p.id===a.mine.id).recall_until;
    expect((await action(0,'open',a.mine.id)).mine.recall_until).toBe(deadline);
    expect((await action(0,'heartbeat',a.mine.id)).mine.recall_until).toBe(deadline);
  }));
  it('at 120 seconds removes both present and absent nonready seats, retaining ready player', () => scenario(async(sql,ids,action)=>{
    const a=await action(0),b=await action(1),c=await action(2);
    await action(0,'ready',a.mine.id,true);await action(2,'away',c.mine.id);
    await sql`update waiting_room_seats set recall_until=now() where id in (${b.mine.id},${c.mine.id})`;
    const out=await action(0,'sync',a.mine.id);
    expect(out.players.map((p:any)=>p.id)).toEqual([a.mine.id]);expect(out.mine.ready).toBe(true);expect(out.mine.recall_until).toBeNull();
    expect((await action(1,'ready',b.mine.id,true)).error).toBe('expired');
  }));
});