import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';

const db = process.env.SUPABASE_DB_URL ? postgres(process.env.SUPABASE_DB_URL, { max: 1, prepare: false }) : null;
afterAll(async () => { await db?.end(); });
const source = readFileSync('drizzle/migrations/0107_weekly_top_three_xp_rewards.sql', 'utf8');
describe.skipIf(!db)('weekly prizes — isolated SQL, no live awards', () => {
  async function scenario(check: (sql: postgres.TransactionSql) => Promise<void>) {
    if (!db) throw new Error('Missing connection');
    await db.begin(async sql => {
      await sql.unsafe(`
        CREATE TEMP TABLE player_xp(session_id text PRIMARY KEY,xp integer NOT NULL DEFAULT 0, updated_at timestamptz) ON COMMIT DROP;
        CREATE TEMP TABLE session_owners(session_id text,device_id text) ON COMMIT DROP;
        CREATE TEMP TABLE weekly_hall_of_fame(session_id text,week_start date,best_score integer,games_played integer,best_at timestamptz,updated_at timestamptz) ON COMMIT DROP;
        CREATE OR REPLACE FUNCTION pg_temp.internal_hof_week() RETURNS date LANGUAGE sql AS $$ SELECT DATE '2026-11-02' $$;
      `);
      const tables = source.match(/CREATE TABLE public\.weekly_[\s\S]*?\n(?:\);|GRANT)/g) ?? [];
      for (const table of tables) {
        await sql.unsafe(table.replace(/\nGRANT$/, '').replace('CREATE TABLE public.', 'CREATE TEMP TABLE ').replaceAll('public.', 'pg_temp.').replace(/\);$/, ') ON COMMIT DROP;'));
      }
      for (const fn of source.match(/CREATE OR REPLACE FUNCTION[\s\S]*?\$function\$;/g) ?? []) {
        await sql.unsafe(fn.replaceAll('public.', 'pg_temp.').replace("SET search_path TO 'public'", "SET search_path TO 'pg_temp'"));
      }
      await sql.unsafe(`
        INSERT INTO pg_temp.weekly_hall_of_fame VALUES
          ('a','2026-10-26',300,40,now(),now()),
          ('b','2026-10-26',290,30,now(),now()),
          ('c','2026-10-26',280,20,now(),now()),
          ('d','2026-10-26',270,10,now(),now()),
          ('old','2026-10-19',350,100,now(),now()),
          ('current','2026-11-02',350,100,now(),now());
        INSERT INTO pg_temp.session_owners VALUES ('a','device-a');
      `);
      await check(sql);
    });
  }
  it.each([{ rank: 1, xp: 3 }, { rank: 2, xp: 2 }, { rank: 3, xp: 1 }])('awards $xp XP at place $rank on each list', async ({ rank, xp }) => {
    await scenario(async sql => {
      await sql.unsafe('SELECT pg_temp.internal_settle_weekly_rewards()');
      const rows = await sql`SELECT list,xp FROM pg_temp.weekly_xp_rewards WHERE rank=${rank} ORDER BY list`;
      expect(rows.map(row => [row.list, row.xp])).toEqual([['games', xp], ['score', xp]]);
    });
  });
  it('pays both lists once, adds to existing XP, and gives nothing to fourth place', async () => {
    await scenario(async sql => {
      await sql.unsafe("INSERT INTO pg_temp.player_xp VALUES ('a',7,now()); SELECT pg_temp.internal_settle_weekly_rewards(); SELECT pg_temp.internal_settle_weekly_rewards();");
      expect((await sql.unsafe("SELECT xp FROM pg_temp.player_xp WHERE session_id='a'"))[0].xp).toBe(13);
      expect((await sql.unsafe("SELECT xp FROM pg_temp.player_xp WHERE session_id='d'"))[0].xp).toBe(0);
      expect((await sql.unsafe('SELECT count(*)::integer AS n FROM pg_temp.weekly_xp_rewards'))[0].n).toBe(6);
    });
  });
  it('never settles the open week or retroactive weeks', async () => {
    await scenario(async sql => {
      await sql.unsafe('SELECT pg_temp.internal_settle_weekly_rewards()');
      expect((await sql.unsafe('SELECT week_start::text FROM pg_temp.weekly_reward_periods')).map(r => r.week_start)).toEqual(['2026-10-26']);
    });
  });
  it('retains receipts until device-checked acknowledgement, without changing XP', async () => {
    await scenario(async sql => {
      const read = async (device: string) => (await sql`SELECT pg_temp.get_weekly_xp_rewards('a',${device}) AS result`)[0].result;
      expect(await read('wrong')).toEqual({ ok: false });
      expect((await read('device-a')).rewards).toHaveLength(2);
      expect((await read('device-a')).rewards).toHaveLength(2);
      expect((await sql.unsafe("SELECT pg_temp.ack_weekly_xp_rewards('a','wrong','2026-10-26') AS ok"))[0].ok).toBe(false);
      expect((await sql.unsafe("SELECT pg_temp.ack_weekly_xp_rewards('a','device-a','2026-10-26') AS ok"))[0].ok).toBe(true);
      expect(await read('device-a')).toMatchObject({ xp: 6, rewards: [] });
    });
  });
  it('cascades private receipts on wallet deletion and cannot re-award the week', async () => {
    await scenario(async sql => {
      await sql.unsafe("SELECT pg_temp.internal_settle_weekly_rewards(); DELETE FROM pg_temp.player_xp WHERE session_id='a'; SELECT pg_temp.internal_settle_weekly_rewards();");
      expect((await sql.unsafe("SELECT count(*)::integer AS n FROM pg_temp.weekly_xp_rewards WHERE session_id='a'"))[0].n).toBe(0);
      expect((await sql.unsafe("SELECT count(*)::integer AS n FROM pg_temp.player_xp WHERE session_id='a'"))[0].n).toBe(0);
    });
  });
});