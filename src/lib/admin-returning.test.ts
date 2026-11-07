import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { adminReturningShare, type AdminDayRow } from './admin-records';

const db = process.env.SUPABASE_DB_URL ? postgres(process.env.SUPABASE_DB_URL, { max: 1, prepare: false }) : null;
afterAll(async () => { await db?.end(); });

it('divides returning devices by today’s playing devices, not yesterday’s or active devices', () => {
  expect(adminReturningShare({ played: 8, devices: 20, returning_played: 3 } as AdminDayRow)).toBe(37.5);
});
it('distinguishes no returning players from no playing players or missing data', () => {
  expect(adminReturningShare({ played: 8, returning_played: 0 } as AdminDayRow)).toBe(0);
  expect(adminReturningShare({ played: 0, returning_played: 0 } as AdminDayRow)).toBeNull();
  expect(adminReturningShare({ played: 8 } as AdminDayRow)).toBeNull();
});

describe.skipIf(!db)('returning device SQL with isolated tables', () => {
  async function fixture() {
    if (!db) throw new Error('Missing SQL connection');
    return db.begin(async sql => {
      await sql.unsafe(`
        CREATE TEMP TABLE analytics_sessions(device_id text,platform text) ON COMMIT DROP;
        CREATE TEMP TABLE analytics_events(device_id text,platform text,created_at timestamptz,event_name text) ON COMMIT DROP;
        CREATE TEMP TABLE excluded_stat_devices(device_id text) ON COMMIT DROP;
        CREATE TEMP TABLE games(id text,updated_at timestamptz,status text,forfeited_by text,forfeited_by_session_id text) ON COMMIT DROP;
        CREATE TEMP TABLE game_players(game_id text,player_index int,session_id text,is_bot boolean) ON COMMIT DROP;
        CREATE TEMP TABLE session_owners(session_id text,device_id text) ON COMMIT DROP;
        CREATE TEMP TABLE admin_match_archive(game_id text,activity_at timestamptz,status text,forfeited_by text,forfeited_by_session_id text) ON COMMIT DROP;
        CREATE TEMP TABLE admin_match_archive_players(game_id text,session_id text) ON COMMIT DROP;
        CREATE TEMP TABLE admin_activity_archive(device_id text,day date,played boolean) ON COMMIT DROP;
        CREATE TEMP TABLE dice_roll_log(game_id text,player_index int,created_at timestamptz) ON COMMIT DROP;
        INSERT INTO analytics_sessions VALUES ('archive','android'),('roll','ios'),('bot','ios'),('away','ios'),('excluded','ios');
        INSERT INTO excluded_stat_devices VALUES ('excluded');
        INSERT INTO analytics_events VALUES
          ('repeat','ios','2026-10-31T12:00Z','game_started'),
          ('repeat','ios','2026-11-01T12:00Z','game_started'),
          ('repeat','ios','2026-11-01T13:00Z','game_finished'),
          ('new','android','2026-11-01T12:00Z','game_started'),
          ('midnight','ios','2026-10-31T23:00Z','game_started'),
          ('midnight','ios','2026-11-01T12:00Z','game_started'),
          ('web','web','2026-10-31T12:00Z','game_started'),
          ('web','web','2026-11-01T12:00Z','game_started'),
          ('excluded','ios','2026-10-31T12:00Z','game_started'),
          ('excluded','ios','2026-11-01T12:00Z','game_started');
        INSERT INTO admin_activity_archive VALUES ('archive','2026-10-31',true),('archive','2026-11-01',true),('away','2026-10-31',false),('away','2026-11-01',false);
        INSERT INTO session_owners VALUES ('sr','roll'),('sb','bot');
        INSERT INTO game_players VALUES ('g',0,'sr',false),('g',1,'sb',true);
        INSERT INTO dice_roll_log VALUES ('g',0,'2026-10-31T12:00Z'),('g',0,'2026-11-01T12:00Z'),('g',1,'2026-10-31T12:00Z'),('g',1,'2026-11-01T12:00Z');
      `);
      const source = readFileSync('drizzle/migrations/0125_admin_returning_playing_devices.sql','utf8').split('REVOKE ALL')[0];
      await sql.unsafe(source.replace('public.admin_daily_returning_players','pg_temp.admin_daily_returning_players').replace("SET search_path TO 'public'", "SET search_path TO 'pg_temp'"));
      return sql`SELECT day::text,returning_played FROM pg_temp.admin_daily_returning_players('2026-11-01') WHERE day <= '2026-11-02' ORDER BY day`;
    });
  }
  it('deduplicates consecutive playing app devices across events, archives and own rolls, including October 31', async () => {
    const rows = await fixture();
    expect(Number(rows[0].returning_played)).toBe(3);
  });
  it('does not count web, excluded devices, bots, away seats or two events on the same Stockholm day', async () => {
    const rows = await fixture();
    expect(rows.map(row => [row.day,Number(row.returning_played)])).toEqual([['2026-11-01',3],['2026-11-02',0]]);
  });
  it('keeps new functions inaccessible to public users', async () => {
    if (!db) throw new Error('Missing SQL connection');
    for (const name of ['admin_daily_returning_players','admin_daily_stats_v8']) {
      const [row] = await db`SELECT has_function_privilege('anon',${`public.${name}(date)`},'EXECUTE') a,has_function_privilege('authenticated',${`public.${name}(date)`},'EXECUTE') b,has_function_privilege('service_role',${`public.${name}(date)`},'EXECUTE') c`;
      expect(row).toEqual({ a:false,b:false,c:true });
    }
  });
});