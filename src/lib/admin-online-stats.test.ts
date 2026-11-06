import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';

const url = process.env.SUPABASE_DB_URL;
const db = url ? postgres(url, { max: 1, prepare: false }) : null;
afterAll(async () => { if (db) await db.end(); });

describe.skipIf(!url)('admin completed online matches (isolated server SQL)', () => {
  async function countFixture(marker: string | null, sessionMarker: string | null = null, status = 'finished', platform = 'ios', players = 1, event: string | null = null, rollPlayer: number | null = null, metric: 'online_finished' | 'played' = 'online_finished') {
    if (!db) throw new Error('Missing test connection');
    const [source] = await db`select pg_get_functiondef('public.admin_daily_stats_v3(date)'::regprocedure) definition`;
    return db.begin(async sql => {
      // Only connection-local tables/function are written. No live games, events or player statistics.
      await sql.unsafe(`
        CREATE TEMP TABLE analytics_sessions(device_id text, platform text, started_at timestamptz, last_seen_at timestamptz, app_version text) ON COMMIT DROP;
        CREATE TEMP TABLE analytics_events(device_id text, platform text, created_at timestamptz, event_name text, game_mode text, app_version text) ON COMMIT DROP;
        CREATE TEMP TABLE games(id text, updated_at timestamptz, status text, forfeited_by text, forfeited_by_session_id text) ON COMMIT DROP;
        CREATE TEMP TABLE game_players(game_id text, session_id text, is_bot boolean, player_index integer) ON COMMIT DROP;
        CREATE TEMP TABLE session_owners(session_id text, device_id text) ON COMMIT DROP;
        CREATE TEMP TABLE dice_roll_log(game_id text, player_index integer, created_at timestamptz) ON COMMIT DROP;
        CREATE TEMP TABLE excluded_stat_devices(device_id text) ON COMMIT DROP;
        CREATE TEMP TABLE admin_match_archive(game_id text PRIMARY KEY,activity_at timestamptz,status text,forfeited_by text,forfeited_by_session_id text,source text) ON COMMIT DROP;
        CREATE TEMP TABLE admin_match_archive_players(game_id text,session_id text, PRIMARY KEY(game_id,session_id)) ON COMMIT DROP;
        CREATE TEMP TABLE admin_activity_archive(device_id text,day date,played boolean, PRIMARY KEY(device_id,day)) ON COMMIT DROP;
      `);
      const helper = readFileSync('drizzle/migrations/0103_admin_issues_latest_two_versions.sql', 'utf8').match(/CREATE OR REPLACE FUNCTION[\s\S]*?\$function\$;/)?.[0];
      if (!helper) throw new Error('Missing isolated release parser');
      await sql.unsafe(helper.replace(/public\.admin_/g, 'pg_temp.admin_').replace("SET search_path TO 'public'", "SET search_path TO 'pg_temp'"));
      const isolatedDefinition = source.definition
        .replace('public.admin_daily_stats_v3', 'pg_temp.admin_daily_stats_v3')
        .replace(/public\.admin_issue_release/g, 'pg_temp.admin_issue_release')
        .replace("SET search_path TO 'public'", "SET search_path TO 'pg_temp'");
      if (isolatedDefinition === source.definition || isolatedDefinition.includes("SET search_path TO 'public'")) throw new Error('Isolation failed');
      await sql.unsafe(isolatedDefinition);
      await sql`insert into pg_temp.games values ('fixture', now(), ${status}, ${marker}, ${sessionMarker})`;
      for (let i = 0; i < players; i++) {
        await sql`insert into pg_temp.analytics_sessions values (${`device-${i}`}, ${platform}, now(), now(), '5.4 (1)')`;
        await sql`insert into pg_temp.session_owners values (${`session-${i}`}, ${`device-${i}`})`;
        await sql`insert into pg_temp.game_players values ('fixture', ${`session-${i}`}, false, ${i})`;
      }
      if (event) await sql`insert into pg_temp.analytics_events values ('device-0', ${platform}, now(), ${event}, 'single_player', '5.4 (1)')`;
      if (rollPlayer !== null) await sql`insert into pg_temp.dice_roll_log values ('fixture', ${rollPlayer}, now())`;
      const [before] = await sql`select * from pg_temp.admin_daily_stats_v3((now() at time zone 'Europe/Stockholm')::date)`;
      const [archiveTrigger] = await sql`select pg_get_functiondef('public.internal_archive_admin_game()'::regprocedure) definition`;
      await sql.unsafe(archiveTrigger.definition.replace('public.internal_archive_admin_game','pg_temp.internal_archive_admin_game').replace("SET search_path TO 'public'","SET search_path TO 'pg_temp'"));
      await sql.unsafe('CREATE TRIGGER archive_fixture BEFORE DELETE ON pg_temp.games FOR EACH ROW EXECUTE FUNCTION pg_temp.internal_archive_admin_game()');
      await sql`delete from pg_temp.games where id='fixture'`;
      await sql`delete from pg_temp.game_players where game_id='fixture'`;
      await sql`delete from pg_temp.dice_roll_log where game_id='fixture'`;
      const [row] = await sql`select * from pg_temp.admin_daily_stats_v3((now() at time zone 'Europe/Stockholm')::date)`;
      expect(row.devices).toBe(before.devices);
      expect(row.played).toBe(before.played);
      expect(row.online_finished).toBe(before.online_finished);
      expect(row.forfeits).toBe(before.forfeits);
      return Number(row[metric]);
    });
  }

  it('does not count Tidsgräns as completed', async () => { expect(await countFixture('Tidsgräns')).toBe(0); });
  it('does not count Ej accepterad as completed', async () => { expect(await countFixture('Ej accepterad')).toBe(0); });
  it('does not count Avbrutet as completed', async () => { expect(await countFixture('Avbrutet')).toBe(0); });
  it('does not count manual forfeits', async () => { expect(await countFixture('Fixture player', 'session-0')).toBe(0); });
  it('does not count a session-only forfeit', async () => { expect(await countFixture(null, 'session-0')).toBe(0); });
  it('counts a completed match once across two app participants', async () => { expect(await countFixture(null, null, 'finished', 'ios', 2)).toBe(1); });
  it('does not count an unfinished match', async () => { expect(await countFixture(null, null, 'playing')).toBe(0); });
  it('excludes web-only matches', async () => { expect(await countFixture(null, null, 'finished', 'web')).toBe(0); });
  it('counts completed Android matches', async () => { expect(await countFixture(null, null, 'finished', 'android')).toBe(1); });
  it('does not count waiting as played', async () => { expect(await countFixture(null, null, 'waiting', 'ios', 1, null, null, 'played')).toBe(0); });
  it('does not count timeout alone as played', async () => { expect(await countFixture('Tidsgräns', null, 'finished', 'ios', 1, null, null, 'played')).toBe(0); });
  it('does not count an unaccepted invite as played', async () => { expect(await countFixture('Ej accepterad', null, 'finished', 'ios', 1, null, null, 'played')).toBe(0); });
  it('retains actual rolls before a forfeit, but not the other seat', async () => { expect(await countFixture('Tidsgräns', null, 'finished', 'ios', 2, null, 0, 'played')).toBe(1); });
  it('counts active online participants', async () => { expect(await countFixture(null, null, 'playing', 'ios', 2, null, null, 'played')).toBe(2); });
  it('counts completed online participants', async () => { expect(await countFixture(null, null, 'finished', 'android', 2, null, null, 'played')).toBe(2); });
  it.each(['game_started', 'quick_match_started', 'game_finished', 'quick_match_online_matched'])('retains %s evidence despite later closure', async event => { expect(await countFixture('Tidsgräns', null, 'finished', 'ios', 1, event, null, 'played')).toBe(1); });
  it('deduplicates start and roll evidence for the same device', async () => { expect(await countFixture('Tidsgräns', null, 'finished', 'ios', 1, 'game_started', 0, 'played')).toBe(1); });
  it('excludes web start and roll evidence', async () => { expect(await countFixture('Tidsgräns', null, 'finished', 'web', 1, 'game_started', 0, 'played')).toBe(0); });
  it('keeps the shared server counter protected', async () => {
    if (!db) throw new Error('Missing test connection');
    const [row] = await db`select
      has_function_privilege('anon','public.admin_daily_stats_v3(date)','EXECUTE') anon_access,
      has_function_privilege('authenticated','public.admin_daily_stats_v3(date)','EXECUTE') auth_access,
      has_function_privilege('service_role','public.admin_daily_stats_v3(date)','EXECUTE') service_access`;
    expect(row.anon_access).toBe(false);
    expect(row.auth_access).toBe(false);
    expect(row.service_access).toBe(true);
  });
});