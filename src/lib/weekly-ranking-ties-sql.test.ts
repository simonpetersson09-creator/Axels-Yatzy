import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';

const db = process.env.SUPABASE_DB_URL ? postgres(process.env.SUPABASE_DB_URL, { max: 1, prepare: false }) : null;
afterAll(async () => { await db?.end(); });
describe.skipIf(!db)('weekly tie rules — isolated copies of deployed functions', () => {
  async function check(mode: 'score' | 'games') {
    if (!db) throw new Error('Missing connection');
    await db.begin(async sql => {
      await sql.unsafe(`
        CREATE TEMP TABLE weekly_hall_of_fame(session_id text,first_name text,country text,week_start date,best_score integer,games_played integer,best_at timestamptz,updated_at timestamptz) ON COMMIT DROP;
        CREATE TEMP TABLE player_country_stats(session_id text PRIMARY KEY,country text) ON COMMIT DROP;
        CREATE TEMP TABLE weekly_reward_periods(week_start date) ON COMMIT DROP;
        CREATE TEMP TABLE player_xp(session_id text PRIMARY KEY,xp integer DEFAULT 0,updated_at timestamptz) ON COMMIT DROP;
        CREATE TEMP TABLE weekly_xp_rewards(session_id text,week_start date,list text,rank integer,xp integer) ON COMMIT DROP;
        CREATE OR REPLACE FUNCTION pg_temp.internal_hof_week() RETURNS date LANGUAGE sql AS $$ SELECT DATE '2026-11-02' $$;
        CREATE OR REPLACE FUNCTION pg_temp.internal_anon_number(text) RETURNS text LANGUAGE sql AS $$ SELECT '4867'::text $$;
      `);
      const definitions = await sql`SELECT pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('get_weekly_hall_of_fame','get_weekly_most_games','internal_hof_rank','internal_settle_weekly_rewards')`;
      for (const row of definitions) await sql.unsafe(row.definition.replace(/public\./g, 'pg_temp.').replace(/SET search_path TO 'public'/g, "SET search_path TO 'pg_temp'"));
      const winnerScore = 300;
      const otherScore = mode === 'score' ? 300 : 290;
      const winnerGames = 20;
      const otherGames = mode === 'score' ? 10 : 20;
      for (const week of ['2026-10-26','2026-11-02']) {
        await sql`INSERT INTO pg_temp.weekly_hall_of_fame VALUES ('winner','Winner','SE',${week}::date,${winnerScore},${winnerGames},now(),now()),('other','Other','SE',${week}::date,${otherScore},${otherGames},now()-interval '1 day',now()-interval '1 day')`;
      }
      const fn = mode === 'score' ? 'get_weekly_hall_of_fame' : 'get_weekly_most_games';
      const rows = await sql.unsafe(`SELECT pg_temp.${fn}(10) AS entries`);
      expect(rows[0].entries.map((p: { session_id: string }) => p.session_id)).toEqual(['winner','other']);
      if (mode === 'score') expect((await sql.unsafe("SELECT pg_temp.internal_hof_rank('winner') AS rank"))[0].rank).toBe(1);
      await sql.unsafe('SELECT pg_temp.internal_settle_weekly_rewards()');
      const awards = await sql`SELECT session_id,xp FROM pg_temp.weekly_xp_rewards WHERE list=${mode} ORDER BY rank`;
      expect(awards.map(p => [p.session_id,p.xp])).toEqual([['winner',3],['other',2]]);
    });
  }
  it('Hall of Fame: equal 300 points puts 20 matches ahead of 10, including rank and prizes', async () => check('score'));
  it('Most games: equal 20 matches puts 300 points ahead of 290, including prizes', async () => check('games'));
});