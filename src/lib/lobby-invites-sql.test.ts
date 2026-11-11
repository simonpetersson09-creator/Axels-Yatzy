import postgres from 'postgres';
import { afterAll, expect, it } from 'vitest';
const db = process.env.SUPABASE_DB_URL ? postgres(process.env.SUPABASE_DB_URL, { max: 1, prepare: false }) : null;
afterAll(async () => { await db?.end(); });
const game = '00000000-0000-0000-0000-000000000001';
async function scenario(check: (sql: postgres.TransactionSql) => Promise<void>) {
  if (!db) throw new Error('Missing SQL connection');
  await db.begin(async sql => {
    await sql.unsafe(`
      CREATE TEMP TABLE games (LIKE public.games INCLUDING DEFAULTS) ON COMMIT DROP;
      CREATE TEMP TABLE game_players (LIKE public.game_players INCLUDING DEFAULTS) ON COMMIT DROP;
      CREATE TEMP TABLE game_invites (LIKE public.game_invites INCLUDING DEFAULTS) ON COMMIT DROP;
      CREATE TEMP TABLE friend_requests (LIKE public.friend_requests INCLUDING DEFAULTS) ON COMMIT DROP;
      CREATE TEMP TABLE session_owners (LIKE public.session_owners INCLUDING DEFAULTS) ON COMMIT DROP;
      CREATE TEMP TABLE player_names (LIKE public.player_names INCLUDING DEFAULTS) ON COMMIT DROP;
      CREATE OR REPLACE FUNCTION pg_temp.check_rate_limit(text,integer) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
    `);
    const definitions = await sql`SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('internal_send_lobby_invites','accept_invite','join_game')`;
    for (const row of definitions) await sql.unsafe(row.def.replace(/public\./g, 'pg_temp.').replace(/SET search_path TO 'public'/g, "SET search_path TO 'pg_temp', 'public'"));
    await sql`INSERT INTO pg_temp.games(id,game_code,status,max_players) VALUES(${game},'ABCDEF','waiting',4)`;
    await sql`INSERT INTO pg_temp.game_players(game_id,player_name,player_index,session_id) VALUES(${game},'Host',0,'host')`;
    await sql.unsafe(`INSERT INTO pg_temp.session_owners(session_id,device_id) VALUES('host','host-device'),('one','one-device'),('two','two-device'),('three','three-device');
      INSERT INTO pg_temp.friend_requests(from_session_id,from_name,to_session_id,to_name,status) VALUES('host','Host','one','One','accepted'),('host','Host','two','Two','accepted'),('host','Host','three','Three','accepted');`);
    await check(sql);
  });
}
it.skipIf(!db)('two friends accept into the same created lobby, without starting or creating another game; repeat is safe', async () => {
  await scenario(async sql => {
    const [sent] = await sql`SELECT pg_temp.internal_send_lobby_invites(${game},'host','host-device',ARRAY['one','two']) AS result`;
    expect(sent.result.success).toBe(true); expect(sent.result.invites).toHaveLength(2);
    for (const invite of sent.result.invites) {
      const [accepted] = await sql`SELECT pg_temp.accept_invite(${invite.id},${invite.to_session_id}) AS result`;
      expect(accepted.result).toMatchObject({ success: true, game_id: game });
      const [again] = await sql`SELECT pg_temp.accept_invite(${invite.id},${invite.to_session_id}) AS result`;
      expect(again.result.success).toBe(true);
    }
    const [counts] = await sql`SELECT (SELECT count(*) FROM pg_temp.games)::int AS games,(SELECT count(*) FROM pg_temp.game_players)::int AS players,(SELECT status FROM pg_temp.games LIMIT 1) AS status`;
    expect(counts).toEqual({ games: 1, players: 3, status: 'waiting' });
  });
});
it.skipIf(!db)('only verified host and accepted friends can send a lobby batch', async () => {
  await scenario(async sql => {
    for (const [sender, device, ids] of [['host','wrong-device',['one']],['one','one-device',['two']],['host','host-device',['stranger']]] as const) {
      const [result] = await sql`SELECT pg_temp.internal_send_lobby_invites(${game},${sender},${device},${sql.array([...ids])}::text[]) AS result`;
      expect(result.result.success).toBe(false);
    }
    const [count] = await sql`SELECT count(*)::int AS n FROM pg_temp.game_invites`; expect(count.n).toBe(0);
  });
});
it.skipIf(!db)('pending invites count towards four places and duplicate batches create no duplicates', async () => {
  await scenario(async sql => {
    await sql`UPDATE pg_temp.games SET max_players=3`;
    const [first] = await sql`SELECT pg_temp.internal_send_lobby_invites(${game},'host','host-device',ARRAY['one','two']) AS result`; expect(first.result.success).toBe(true);
    const [repeat] = await sql`SELECT pg_temp.internal_send_lobby_invites(${game},'host','host-device',ARRAY['one','two']) AS result`; expect(repeat.result.success).toBe(true);
    const [full] = await sql`SELECT pg_temp.internal_send_lobby_invites(${game},'host','host-device',ARRAY['three']) AS result`; expect(full.result.success).toBe(false);
    const [count] = await sql`SELECT count(*)::int AS n FROM pg_temp.game_invites`; expect(count.n).toBe(2);
  });
});
it.skipIf(!db)('expired, started or deleted lobby never falls back to creating a two-player match', async () => {
  await scenario(async sql => {
    const [sent] = await sql`SELECT pg_temp.internal_send_lobby_invites(${game},'host','host-device',ARRAY['one']) AS result`;
    const id = sent.result.invites[0].id;
    await sql`UPDATE pg_temp.games SET status='playing'`;
    const [started] = await sql`SELECT pg_temp.accept_invite(${id},'one') AS result`; expect(started.result.success).toBe(false);
    await sql`UPDATE pg_temp.games SET status='waiting'`; await sql`UPDATE pg_temp.game_invites SET expires_at=now()-interval '1 minute'`;
    const [expired] = await sql`SELECT pg_temp.accept_invite(${id},'one') AS result`; expect(expired.result.success).toBe(false);
    await sql`UPDATE pg_temp.game_invites SET game_id=NULL`;
    const [deleted] = await sql`SELECT pg_temp.accept_invite(${id},'one') AS result`; expect(deleted.result.success).toBe(false);
    const [count] = await sql`SELECT count(*)::int AS n FROM pg_temp.games`; expect(count.n).toBe(1);
  });
});
it.skipIf(!db)('ordinary crossed invites do not consume a pending created-lobby invitation', async () => {
  await scenario(async sql => {
    const [sent] = await sql`SELECT pg_temp.internal_send_lobby_invites(${game},'host','host-device',ARRAY['one']) AS result`;
    const lobbyId = sent.result.invites[0].id;
    const [ordinary] = await sql`INSERT INTO pg_temp.game_invites(from_session_id,from_name,to_session_id,to_name) VALUES('one','One','host','Host') RETURNING id`;
    const [accepted] = await sql`SELECT pg_temp.accept_invite(${ordinary.id},'host') AS result`;
    expect(accepted.result.success).toBe(true);
    expect(accepted.result.game_id).not.toBe(game);
    const [preserved] = await sql`SELECT status,game_id FROM pg_temp.game_invites WHERE id=${lobbyId}`;
    expect(preserved).toEqual({ status: 'pending', game_id: game });
  });
});
