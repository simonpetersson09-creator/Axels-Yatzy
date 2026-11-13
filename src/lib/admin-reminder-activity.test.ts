import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
const db = process.env.SUPABASE_DB_URL ? postgres(process.env.SUPABASE_DB_URL, { max: 1, prepare: false }) : null;
afterAll(async () => { await db?.end(); });
describe.skipIf(!db)('server reminders are not player activity (isolated deployed SQL)', () => {
 async function fixture(event: string, visit = false) {
  if (!db) throw new Error('Missing SQL connection');
  const names = ['admin_is_app_activity_event(text)','admin_mean_app_age(date,date[])','admin_median_app_age(date,date[])','admin_daily_stats_v3(date)','admin_daily_stats_v4(date)','admin_daily_stats_v5(date)'];
  const definitions: string[] = [];
  for (const name of names) {
   const [row] = await db`select pg_get_functiondef(${`public.${name}`}::regprocedure) definition`;
   definitions.push(row.definition);
  }
  return db.begin(async sql => {
      await sql.unsafe(`
        CREATE TEMP TABLE analytics_sessions(device_id text, platform text, started_at timestamptz, last_seen_at timestamptz, app_version text) ON COMMIT DROP;
        CREATE TEMP TABLE analytics_events(device_id text, platform text, created_at timestamptz, event_name text, game_mode text, app_version text) ON COMMIT DROP;
        CREATE TEMP TABLE games(id text, updated_at timestamptz, status text, forfeited_by text, forfeited_by_session_id text) ON COMMIT DROP;
        CREATE TEMP TABLE game_players(game_id text, session_id text, is_bot boolean, player_index integer) ON COMMIT DROP;
        CREATE TEMP TABLE session_owners(session_id text PRIMARY KEY, device_id text) ON COMMIT DROP;
        CREATE TEMP TABLE dice_roll_log(game_id text, player_index integer, created_at timestamptz) ON COMMIT DROP;
        CREATE TEMP TABLE excluded_stat_devices(device_id text) ON COMMIT DROP;
        CREATE TEMP TABLE admin_match_archive(game_id text PRIMARY KEY,activity_at timestamptz,status text,forfeited_by text,forfeited_by_session_id text,source text) ON COMMIT DROP;
        CREATE TEMP TABLE admin_match_archive_players(game_id text,session_id text REFERENCES pg_temp.session_owners(session_id) ON DELETE CASCADE, PRIMARY KEY(game_id,session_id)) ON COMMIT DROP;
        CREATE TEMP TABLE admin_activity_archive(device_id text,day date,played boolean, PRIMARY KEY(device_id,day)) ON COMMIT DROP;
      `);
      const helper = readFileSync('drizzle/migrations/0103_admin_issues_latest_two_versions.sql', 'utf8').match(/CREATE OR REPLACE FUNCTION[\s\S]*?\$function\$;/)?.[0];
      if (!helper) throw new Error('Missing isolated release parser');
      await sql.unsafe(helper.replace(/public\.admin_/g, 'pg_temp.admin_').replace("SET search_path TO 'public'", "SET search_path TO 'pg_temp'"));

   for (const source of definitions) await sql.unsafe(source.replace(/public\.admin_/g, 'pg_temp.admin_').replace(/SET search_path TO 'public'/g, "SET search_path TO 'pg_temp'"));
   // Old recipient session is not a visit today. Only delivery is recorded today.
   await sql`insert into pg_temp.analytics_sessions values ('recipient','android',now()-interval '2 days',now()-interval '2 days','5.7 (1)')`;
   await sql`insert into pg_temp.analytics_events values ('recipient','android',now(),${event},null,'5.7 (1)')`;
   if (visit) await sql`insert into pg_temp.analytics_sessions values ('recipient','android',now(),now(),'5.7 (1)')`;
   const [row] = await sql`select * from pg_temp.admin_daily_stats_v5((now() at time zone 'Europe/Stockholm')::date)`;
   return { devices: Number(row.devices), android: Number(row.android), played: Number(row.played), age: row.avg_app_age_days, median: row.median_app_age_days };
  });
 }
 it('a sent play reminder alone counts as zero active and zero playing devices', async () => {
  expect(await fixture('play_reminder_sent')).toEqual({devices:0,android:0,played:0,age:null,median:null});
 });
 it.each(['reminder_notification_sent','turn_notification_sent','broadcast_notification_sent'])('delivery event %s is not recipient activity', async event => {
  expect(await fixture(event)).toEqual({devices:0,android:0,played:0,age:null,median:null});
 });
 it('keeps an actual app visit even when a reminder is sent the same day', async () => {
  expect(await fixture('play_reminder_sent',true)).toMatchObject({devices:1,android:1,played:0});
 });
 it('keeps actual playing evidence', async () => {
  expect(await fixture('game_started')).toMatchObject({devices:1,android:1,played:1});
 });
 it('keeps an opened app notification as real recipient activity', async () => {
  expect(await fixture('push_notification_received_foreground')).toMatchObject({devices:1,android:1,played:0});
 });
 it('keeps admin functions protected', async () => {
  if (!db) throw new Error('Missing SQL connection');
  const [row] = await db`select has_function_privilege('anon','public.admin_is_app_activity_event(text)','EXECUTE') a,has_function_privilege('authenticated','public.admin_is_app_activity_event(text)','EXECUTE') b,has_function_privilege('service_role','public.admin_is_app_activity_event(text)','EXECUTE') c`;
  expect(row).toEqual({a:false,b:false,c:true});
 });
});
