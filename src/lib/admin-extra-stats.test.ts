import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { adminForfeitShare, adminOnlineOutcomes, type AdminDayRow } from './admin-records';

const db = process.env.SUPABASE_DB_URL ? postgres(process.env.SUPABASE_DB_URL, { max: 1, prepare: false }) : null;
afterAll(async () => { await db?.end(); });

it('uses completed plus forfeited outcomes, not ongoing matches', () => {
  const row = { online_finished: 12, forfeits: 1 } as AdminDayRow;
  expect(adminOnlineOutcomes(row)).toBe(13);
  expect(adminForfeitShare(row)).toBeCloseTo(100 / 13);
  expect(adminForfeitShare({ online_finished: 0, forfeits: 0 } as AdminDayRow)).toBeNull();
});

describe.skipIf(!db)('admin extra counters in connection-local fixtures', () => {
  async function fixture() {
    if (!db) throw new Error('Missing SQL test connection');
    return db.begin(async sql => {
      await sql.unsafe(`
        CREATE TEMP TABLE analytics_sessions(device_id text,platform text,app_version text) ON COMMIT DROP;
        CREATE TEMP TABLE analytics_events(id text,device_id text,platform text,app_version text,created_at timestamptz,event_name text,metadata jsonb) ON COMMIT DROP;
        CREATE TEMP TABLE excluded_stat_devices(device_id text) ON COMMIT DROP;
        CREATE TEMP TABLE admin_activity_archive(device_id text,day date,played boolean) ON COMMIT DROP;
        CREATE TEMP TABLE online_match_scores(session_id text,finished_at timestamptz) ON COMMIT DROP;
        CREATE TEMP TABLE session_owners(session_id text,device_id text) ON COMMIT DROP;
        CREATE TEMP TABLE dice_roll_log(game_id text,player_index int,created_at timestamptz) ON COMMIT DROP;
        CREATE TEMP TABLE game_players(game_id text,player_index int,session_id text,is_bot boolean) ON COMMIT DROP;
        INSERT INTO pg_temp.analytics_sessions VALUES ('a','ios','5.6 (2)'),('b','android','5.5 (1)'),('old','ios','5.4 (1)'),('excluded','ios','5.6 (2)');
        INSERT INTO pg_temp.excluded_stat_devices VALUES ('excluded');
        INSERT INTO pg_temp.analytics_events VALUES
        ('1','a','ios','5.6 (2)','2026-11-07T08:00Z','mp_issue','{}'),
        ('2','a','ios','5.6 (2)','2026-11-07T08:01Z','mp_issue','{}'),
        ('3','b','android','5.5 (1)','2026-11-07T08:02Z','mp_issue','{}'),
        ('4','old','ios','5.4 (1)','2026-11-07T08:02Z','mp_issue','{}'),
        ('5','web','web','5.6 (2)','2026-11-07T08:02Z','mp_issue','{}'),
        ('6','excluded','ios','5.6 (2)','2026-11-07T08:02Z','mp_issue','{}'),
        ('7','a','ios','5.6 (2)','2026-10-30T08:00Z','game_started','{}'),
        ('8','a','ios','5.6 (2)','2026-11-07T08:00Z','game_started','{}'),
        ('9','b','android','5.5 (1)','2026-11-06T23:30Z','game_started','{}'),
        ('10','b','android','5.5 (1)','2026-11-07T08:01Z','game_finished','{}'),
        ('11','a','ios','5.6 (2)','2026-11-07T08:00Z','post_match_exit','{"matchKey":"m1","completed":true,"result":"clicked"}'),
        ('12','a','ios','5.6 (2)','2026-11-07T08:01Z','post_match_exit','{"matchKey":"m1","completed":true,"result":"shown"}'),
        ('13','a','ios','5.6 (2)','2026-11-07T08:02Z','post_match_exit','{"matchKey":"m1","completed":true,"result":"clicked"}'),
        ('14','a','ios','5.6 (2)','2026-11-07T08:03Z','post_match_exit','{"matchKey":"m1","completed":true,"result":"shown"}'),
        ('15','a','ios','5.6 (2)','2026-11-07T08:04Z','post_match_exit','{"matchKey":"m2","completed":true,"result":"clicked"}'),
        ('16','a','ios','5.6 (2)','2026-11-07T08:05Z','post_match_exit','{"matchKey":"m3","completed":false,"result":"clicked"}'),
        ('17','a','ios','5.6 (2)','2026-11-07T08:06Z','ad_opportunity','{"kind":"appOpen","result":"shown"}');
      `);
      const source = readFileSync('drizzle/migrations/0123_admin_daily_extended_metrics.sql','utf8').split('REVOKE ALL')[0];
      const parser = readFileSync('drizzle/migrations/0103_admin_issues_latest_two_versions.sql','utf8').split('REVOKE ALL')[0];
      await sql.unsafe(parser.replace('public.admin_issue_release','pg_temp.admin_issue_release').replace("SET search_path TO 'public'", "SET search_path TO 'pg_temp'"));
      await sql.unsafe(source.replace('public.admin_daily_extra_stats','pg_temp.admin_daily_extra_stats').replace(/public\.admin_issue_release/g,'pg_temp.admin_issue_release').replace("SET search_path TO 'public'", "SET search_path TO 'pg_temp'"));
      const [row] = await sql`select * from pg_temp.admin_daily_extra_stats('2026-11-07') where day='2026-11-07'`;
      return row;
    });
  }
  it('counts unique affected app devices using the same latest two releases and exclusions', async () => {
    expect(Number((await fixture()).issue_devices)).toBe(2);
  });
  it('counts first recorded play from full history on Stockholm days, excluding web', async () => {
    expect(Number((await fixture()).new_players)).toBe(1);
  });
  it('counts shown versus completed-result exits once per device and match', async () => {
    const row = await fixture();
    expect(Number(row.post_match_shown)).toBe(1);
    expect(Number(row.post_match_opportunities)).toBe(2);
  });
  it('keeps both aggregate functions unavailable to public users', async () => {
    if (!db) throw new Error('Missing SQL test connection');
    for (const name of ['admin_daily_extra_stats','admin_daily_stats_v7']) {
      const [row] = await db`select has_function_privilege('anon',${`public.${name}(date)`},'EXECUTE') a,has_function_privilege('authenticated',${`public.${name}(date)`},'EXECUTE') b,has_function_privilege('service_role',${`public.${name}(date)`},'EXECUTE') c`;
      expect(row).toEqual({ a: false, b: false, c: true });
    }
  });
});