import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';

const db = process.env.SUPABASE_DB_URL ? postgres(process.env.SUPABASE_DB_URL, { max: 1, prepare: false }) : null;
afterAll(async () => { await db?.end(); });

describe.skipIf(!db)('weekly country fallback — isolated SQL', () => {
  async function scenario(check: (sql: postgres.TransactionSql) => Promise<void>) {
    if (!db) throw new Error('Missing connection');
    await db.begin(async sql => {
      await sql.unsafe(`
        CREATE TEMP TABLE player_country_stats(session_id text PRIMARY KEY,country text) ON COMMIT DROP;
        CREATE TEMP TABLE weekly_hall_of_fame(session_id text,first_name text,country text,week_start date,best_score integer,games_played integer,best_at timestamptz,updated_at timestamptz,PRIMARY KEY(session_id,week_start)) ON COMMIT DROP;
        CREATE OR REPLACE FUNCTION pg_temp.internal_hof_week() RETURNS date LANGUAGE sql AS $$ SELECT DATE '2026-11-02' $$;
        CREATE OR REPLACE FUNCTION pg_temp.internal_anon_number(text) RETURNS text LANGUAGE sql AS $$ SELECT '4867'::text $$;
        CREATE OR REPLACE FUNCTION pg_temp.claim_session(text,text) RETURNS boolean LANGUAGE sql AS $$ SELECT $2 = 'valid-device' $$;
        INSERT INTO pg_temp.player_country_stats VALUES ('maxence','FR'),('explicit','FR');
        INSERT INTO pg_temp.weekly_hall_of_fame VALUES ('maxence','Maxence',NULL,'2026-11-02',300,20,now(),now()),('explicit','Explicit','SE','2026-11-02',290,10,now(),now()),('unknown','Unknown',NULL,'2026-11-02',280,5,now(),now());
      `);
      const definitions = await sql`SELECT pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('get_weekly_hall_of_fame','get_weekly_most_games','report_weekly_score')`;
      for (const row of definitions) await sql.unsafe(row.definition.replace(/public\./g, 'pg_temp.').replace(/SET search_path TO 'public'/g, "SET search_path TO 'pg_temp'"));
      await check(sql);
    });
  }

  it('shows Maxence as FR in both lists without changing 300 points, 20 matches or order', async () => scenario(async sql => {
    const [row] = await sql.unsafe('SELECT pg_temp.get_weekly_hall_of_fame(10) AS hof,pg_temp.get_weekly_most_games(10) AS most');
    for (const list of [row.hof, row.most]) {
      expect(list.map((p: { session_id: string }) => p.session_id)).toEqual(['maxence','explicit','unknown']);
      expect(list[0]).toMatchObject({ country: 'FR', best_score: 300, games_played: 20 });
      expect(list[1].country).toBe('SE');
      expect(list[2].country).toBeNull();
    }
    const [stored] = await sql`SELECT country,best_score,games_played FROM pg_temp.weekly_hall_of_fame WHERE session_id='maxence'`;
    expect(stored).toEqual({ country: null, best_score: 300, games_played: 20 });
  }));

  it('uses registered FR when a future accepted report omits country', async () => scenario(async sql => {
    await sql.unsafe("SELECT pg_temp.report_weekly_score('maxence','valid-device','Maxence',250,NULL)");
    const [row] = await sql`SELECT country,best_score,games_played FROM pg_temp.weekly_hall_of_fame WHERE session_id='maxence'`;
    expect(row).toEqual({ country: 'FR', best_score: 300, games_played: 21 });
  }));

  it('preserves explicit country and refuses an unclaimed device', async () => scenario(async sql => {
    await sql.unsafe("SELECT pg_temp.report_weekly_score('explicit','valid-device','Explicit',250,'NO')");
    expect((await sql`SELECT country FROM pg_temp.weekly_hall_of_fame WHERE session_id='explicit'`)[0].country).toBe('NO');
    expect((await sql.unsafe("SELECT pg_temp.report_weekly_score('maxence','wrong-device','Maxence',374,'SE') AS ok"))[0].ok).toBe(false);
    expect((await sql`SELECT country,games_played FROM pg_temp.weekly_hall_of_fame WHERE session_id='maxence'`)[0]).toEqual({ country: null, games_played: 20 });
  }));
});