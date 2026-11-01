import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';

const url = process.env.SUPABASE_DB_URL;
const db = url ? postgres(url, { max: 1, prepare: false }) : null;
afterAll(async () => { if (db) await db.end(); });

const FILES = [
  'drizzle/migrations/0099_admin_daily_mean_app_age.sql',
  'drizzle/migrations/0100_admin_daily_median_app_age.sql',
  'drizzle/migrations/0103_admin_issues_latest_two_versions.sql',
  'drizzle/migrations/0105_admin_exclude_stat_devices.sql',
];

function definitions(file: string) {
  return readFileSync(file, 'utf8').match(/CREATE (?:OR REPLACE )?FUNCTION[\s\S]*?(?:\$function\$|\$\$);/g) ?? [];
}

type Device = { id: string; platform?: string; firstDaysAgo?: number; events?: string[] };

describe.skipIf(!url)('admin excluded devices (isolated SQL)', () => {
  async function stats(opts: { excluded?: string[]; devices: Device[] }) {
    if (!db) throw new Error('Missing test connection');
    return db.begin(async sql => {
      // Only connection-local tables/functions are written. No live games, events or player statistics.
      await sql.unsafe(`
        CREATE TEMP TABLE analytics_sessions(device_id text, platform text, started_at timestamptz, last_seen_at timestamptz, app_version text) ON COMMIT DROP;
        CREATE TEMP TABLE analytics_events(device_id text, platform text, created_at timestamptz, event_name text, game_mode text, app_version text) ON COMMIT DROP;
        CREATE TEMP TABLE games(id text, updated_at timestamptz, status text, forfeited_by text, forfeited_by_session_id text) ON COMMIT DROP;
        CREATE TEMP TABLE game_players(game_id text, session_id text, is_bot boolean, player_index integer) ON COMMIT DROP;
        CREATE TEMP TABLE session_owners(session_id text, device_id text) ON COMMIT DROP;
        CREATE TEMP TABLE dice_roll_log(game_id text, player_index integer, created_at timestamptz) ON COMMIT DROP;
        CREATE TEMP TABLE excluded_stat_devices(device_id text) ON COMMIT DROP;
      `);
      for (const file of FILES) {
        for (const def of definitions(file)) {
          await sql.unsafe(def.replace(/public\.admin_/g, 'pg_temp.admin_').replace("SET search_path TO 'public'", "SET search_path TO 'pg_temp'"));
        }
      }
      for (const id of opts.excluded ?? []) {
        await sql`insert into pg_temp.excluded_stat_devices values (${id})`;
      }
      for (const d of opts.devices) {
        await sql`insert into pg_temp.analytics_sessions values (${d.id}, ${d.platform ?? 'ios'}, now() - ${d.firstDaysAgo ?? 0} * interval '1 day', now(), '5.4 (1)')`;
        for (const ev of d.events ?? []) {
          await sql`insert into pg_temp.analytics_events values (${d.id}, ${d.platform ?? 'ios'}, now(), ${ev}, 'single_player', '5.4 (1)')`;
        }
      }
      const today = `(now() at time zone 'Europe/Stockholm')::date`;
      const [row] = await sql.unsafe(`select * from pg_temp.admin_daily_stats_v5(${today}) where day = ${today}`);
      return {
        devices: Number(row?.devices ?? 0),
        ios: Number(row?.ios ?? 0),
        played: Number(row?.played ?? 0),
        issues: Number(row?.issues ?? 0),
        cpu: Number(row?.cpu_finished ?? 0),
        avgAge: Number(row?.avg_app_age_days ?? 0),
        medianAge: Number(row?.median_app_age_days ?? 0),
      };
    });
  }

  it('excludes the listed device from active and played counts only', async () => {
    const row = await stats({
      excluded: ['admin-device'],
      devices: [
        { id: 'admin-device', events: ['game_started'] },
        { id: 'player-device', events: ['game_started'] },
      ],
    });
    expect(row).toMatchObject({ devices: 1, ios: 1, played: 1 });
  });

  it('counts the same device when the exclusion list is empty', async () => {
    const row = await stats({ devices: [{ id: 'admin-device', events: ['game_started'] }] });
    expect(row).toMatchObject({ devices: 1, played: 1 });
  });

  it('hides issues from excluded devices but keeps other devices’ issues', async () => {
    const row = await stats({
      excluded: ['admin-device'],
      devices: [
        { id: 'admin-device', events: ['mp_issue'] },
        { id: 'player-device', events: ['mp_issue'] },
      ],
    });
    expect(row.issues).toBe(1);
  });

  it('keeps completed-match counts from excluded devices', async () => {
    const row = await stats({
      excluded: ['admin-device'],
      devices: [{ id: 'admin-device', events: ['game_finished'] }],
    });
    expect(row).toMatchObject({ devices: 0, played: 0, cpu: 1 });
  });

  it('removes excluded devices from the mean and median app-age basis', async () => {
    const devices: Device[] = [
      { id: 'admin-device', firstDaysAgo: 100 },
      { id: 'player-device', firstDaysAgo: 0 },
    ];
    const withExclusion = await stats({ excluded: ['admin-device'], devices });
    expect(withExclusion).toMatchObject({ avgAge: 0, medianAge: 0 });
    const withoutExclusion = await stats({ devices });
    expect(withoutExclusion).toMatchObject({ avgAge: 50, medianAge: 50 });
  });
});
