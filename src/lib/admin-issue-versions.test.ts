import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';

const url = process.env.SUPABASE_DB_URL;
const db = url ? postgres(url, { max: 1, prepare: false }) : null;
const migration = readFileSync('drizzle/migrations/0103_admin_issues_latest_two_versions.sql', 'utf8');
const exclusion = readFileSync('drizzle/migrations/0106_admin_stats_v3_fast_release_lookup.sql', 'utf8');
afterAll(async () => { if (db) await db.end(); });

type Event = { version: string | null; platform?: string; name?: string; yesterday?: boolean };
describe.skipIf(!url)('admin issues latest two releases (isolated SQL)', () => {
  async function counts(events: Event[], sessions: string[] = []) {
    if (!db) throw new Error('Missing test connection');
    return db.begin(async sql => {
      await sql.unsafe(`
        CREATE TEMP TABLE analytics_sessions(device_id text, platform text, started_at timestamptz, last_seen_at timestamptz, app_version text) ON COMMIT DROP;
        CREATE TEMP TABLE analytics_events(device_id text, platform text, created_at timestamptz, event_name text, game_mode text, app_version text) ON COMMIT DROP;
        CREATE TEMP TABLE games(id text, updated_at timestamptz, status text, forfeited_by text, forfeited_by_session_id text) ON COMMIT DROP;
        CREATE TEMP TABLE game_players(game_id text, session_id text, is_bot boolean, player_index integer) ON COMMIT DROP;
        CREATE TEMP TABLE session_owners(session_id text, device_id text) ON COMMIT DROP;
        CREATE TEMP TABLE dice_roll_log(game_id text, player_index integer, created_at timestamptz) ON COMMIT DROP;
        CREATE TEMP TABLE excluded_stat_devices(device_id text) ON COMMIT DROP;
      `);
      const releaseParser = migration.match(/CREATE OR REPLACE FUNCTION[\s\S]*?\$function\$;/g)?.[0];
      const statsFunction = exclusion.match(/CREATE OR REPLACE FUNCTION[\s\S]*?\$function\$;/g)?.[0];
      if (!releaseParser || !statsFunction) throw new Error('Expected both production functions');
      for (const definition of [releaseParser, statsFunction]) {
        await sql.unsafe(definition.replace(/public\.admin_/g, 'pg_temp.admin_').replace("SET search_path TO 'public'", "SET search_path TO 'pg_temp'"));
      }
      await sql.unsafe(optimization.replace(/public\.admin_/g, 'pg_temp.admin_'));
      for (const version of sessions) {
        await sql`insert into pg_temp.analytics_sessions values ('device', 'ios', now(), now(), ${version})`;
      }
      for (const event of events) {
        await sql`insert into pg_temp.analytics_events values ('device', ${event.platform ?? 'ios'}, now() - ${event.yesterday ? 1 : 0} * interval '1 day', ${event.name ?? 'mp_issue'}, 'single_player', ${event.version})`;
      }
      const rows = await sql`select * from pg_temp.admin_daily_stats_v3((now() at time zone 'Europe/Stockholm')::date - 1)`;
      return { issues: rows.reduce((n, r) => n + Number(r.issues), 0), cpu: rows.reduce((n, r) => n + Number(r.cpu_finished), 0), played: Number(rows[0]?.played) };
    });
  }

  it('counts exactly the latest two releases, excluding older issues', async () => {
    expect((await counts([{ version: '5.4 (1)' }, { version: '5.3 (1)' }, { version: '5.2 (1)' }, { version: '5.1 (2)' }])).issues).toBe(2);
  });
  it('combines iOS and Android but ignores web versions and issues', async () => {
    expect((await counts([{ version: '5.4', platform: 'ios' }, { version: '5.3', platform: 'android' }, { version: '99.0', platform: 'web' }])).issues).toBe(2);
  });
  it('does not treat different builds as different releases', async () => {
    expect((await counts([{ version: '5.4 (2)' }, { version: '5.4 (1)' }, { version: '5.3 (1)' }, { version: '5.2' }])).issues).toBe(3);
  });
  it('sorts versions numerically, including patch versions', async () => {
    expect((await counts([{ version: '5.10.1' }, { version: '5.10.0' }, { version: '5.9' }])).issues).toBe(2);
  });
  it('selects releases with no issues using ordinary activity and sessions', async () => {
    expect((await counts([{ version: '5.3', name: 'app_opened' }, { version: '5.2' }], ['5.4'])).issues).toBe(0);
  });
  it('applies the same current release pair to older dates', async () => {
    expect((await counts([{ version: '5.2', yesterday: true }, { version: '5.3', yesterday: true }], ['5.4'])).issues).toBe(1);
  });
  it('preserves completed matches and played counts from older releases', async () => {
    expect(await counts([{ version: '5.1', name: 'game_finished' }, { version: '5.1' }], ['5.4', '5.3'])).toEqual({ issues: 0, cpu: 1, played: 1 });
  });
  it('ignores missing and malformed issue versions', async () => {
    expect((await counts([{ version: null }, { version: 'unknown' }, { version: '5.4' }])).issues).toBe(1);
  });
});