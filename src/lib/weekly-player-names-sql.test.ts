import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';

const db = process.env.SUPABASE_DB_URL ? postgres(process.env.SUPABASE_DB_URL, { max: 1, prepare: false }) : null;
afterAll(async () => { await db?.end(); });
describe.skipIf(!db)('consistent weekly names — isolated SQL', () => {
  it('shows Spelare 4867 in both lists when the duplicate is outside the score top ten', async () => {
    if (!db) throw new Error('Missing connection');
    await db.begin(async sql => {
      await sql.unsafe(`
        CREATE TEMP TABLE weekly_hall_of_fame(session_id text, first_name text, country text, week_start date, best_score integer, games_played integer, best_at timestamptz, updated_at timestamptz) ON COMMIT DROP;
        CREATE OR REPLACE FUNCTION pg_temp.internal_hof_week() RETURNS date LANGUAGE sql AS $$ SELECT DATE '2026-11-02' $$;
        CREATE OR REPLACE FUNCTION pg_temp.internal_anon_number(text) RETURNS text LANGUAGE sql AS $$ SELECT '4867'::text $$;
        INSERT INTO pg_temp.weekly_hall_of_fame VALUES ('target','Spelare','SE','2026-11-02',300,20,now(),now()), ('duplicate','Spelare','SE','2026-11-02',1,100,now(),now());
        INSERT INTO pg_temp.weekly_hall_of_fame SELECT 'other-'||n, 'Name-'||n, 'SE', DATE '2026-11-02', 200+n, 1,now(),now() FROM generate_series(1,9) n;
      `);
      const source = readFileSync('drizzle/migrations/0109_consistent_weekly_player_names.sql', 'utf8');
      await sql.unsafe(source.replace(/public\./g, 'pg_temp.').replace(/SET search_path TO 'public'/g, "SET search_path TO 'pg_temp'"));
      const rows = await sql.unsafe(`SELECT pg_temp.get_weekly_hall_of_fame(10) AS hof, pg_temp.get_weekly_most_games(10) AS most`);
      const target = (entries: { session_id: string; name: string }[]) => entries.find(p => p.session_id === 'target')?.name;
      expect(target(rows[0].hof)).toBe('Spelare 4867');
      expect(target(rows[0].most)).toBe('Spelare 4867');
      expect(rows[0].hof[0].best_score).toBe(300);
      expect(rows[0].most[0].games_played).toBe(100);
    });
  });
});