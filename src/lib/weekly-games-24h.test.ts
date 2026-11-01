import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
const db = process.env.SUPABASE_DB_URL ? postgres(process.env.SUPABASE_DB_URL, { max: 1, prepare: false }) : null;
afterAll(async () => { await db?.end(); });
const source = readFileSync('drizzle/migrations/0108_weekly_rolling_24h_game_counts.sql', 'utf8');
describe.skipIf(!db)('24h weekly counts, temporary data only', () => {
  async function run(check: (sql: postgres.TransactionSql) => Promise<void>) {
    if (!db) throw new Error('No connection');
    await db.begin(async sql => {
      await sql.unsafe(`CREATE TEMP TABLE session_owners(session_id text PRIMARY KEY) ON COMMIT DROP;
        CREATE TEMP TABLE weekly_hall_of_fame(session_id text,games_played integer) ON COMMIT DROP;
        CREATE TEMP TABLE weekly_game_completions(session_id text REFERENCES pg_temp.session_owners ON DELETE CASCADE,completed_at timestamptz DEFAULT now()) ON COMMIT DROP;
        CREATE TEMP TABLE weekly_game_tracking(id integer,started_at timestamptz) ON COMMIT DROP;
        INSERT INTO pg_temp.weekly_game_tracking VALUES(1,now()-interval '25 hours');
        INSERT INTO pg_temp.session_owners VALUES('a'),('b');`);
      for (const fn of source.match(/CREATE OR REPLACE FUNCTION[\s\S]*?\$function\$;/g) ?? []) await sql.unsafe(fn.replace(/public\./g,'pg_temp.').replace("SET search_path TO 'public'","SET search_path TO 'pg_temp'"));
      await sql.unsafe('CREATE TRIGGER completion_log AFTER INSERT OR UPDATE ON pg_temp.weekly_hall_of_fame FOR EACH ROW EXECUTE FUNCTION pg_temp.internal_log_weekly_completion()');
      await check(sql);
    });
  }
  it('counts only the rolling 24 hours, across the week boundary, not calendar days', async () => {
    await run(async sql => {
      await sql.unsafe(`INSERT INTO pg_temp.weekly_game_completions VALUES('a',now()-interval '24 hours'),('a',now()-interval '24 hours'+interval '1 second'),('a',now()-interval '23 hours'),('a',now()),('a',now()+interval '1 second'),('b',now());`);
      const [r] = await sql.unsafe("SELECT pg_temp.get_weekly_games_24h(ARRAY['a','b']) AS data");
      expect(r.data).toEqual([{session_id:'a',games_24h:3},{session_id:'b',games_24h:1}]);
    });
  });
  it('records an accepted completion once but not unchanged score/profile updates', async () => {
    await run(async sql => {
      await sql.unsafe("INSERT INTO pg_temp.weekly_hall_of_fame VALUES('a',1); UPDATE pg_temp.weekly_hall_of_fame SET games_played=2; UPDATE pg_temp.weekly_hall_of_fame SET games_played=2;");
      expect((await sql.unsafe("SELECT pg_temp.get_weekly_games_24h(ARRAY['a']) AS data"))[0].data).toEqual([{session_id:'a',games_24h:2}]);
    });
  });
  it('shows unavailable instead of a misleading zero until 24h of tracking exists', async () => {
    await run(async sql => {
      await sql.unsafe('UPDATE pg_temp.weekly_game_tracking SET started_at=now()');
      expect((await sql.unsafe("SELECT pg_temp.get_weekly_games_24h(ARRAY['a']) AS data"))[0].data).toEqual([{session_id:'a',games_24h:null}]);
    });
  });
  it('removes the completion log when the player deletes their owned session', async () => {
    await run(async sql => {
      await sql.unsafe("INSERT INTO pg_temp.weekly_hall_of_fame VALUES('a',1); DELETE FROM pg_temp.session_owners WHERE session_id='a';");
      expect((await sql.unsafe('SELECT count(*)::integer AS n FROM pg_temp.weekly_game_completions'))[0].n).toBe(0);
    });
  });
});