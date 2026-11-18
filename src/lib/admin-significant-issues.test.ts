import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';

const db = process.env.SUPABASE_DB_URL ? postgres(process.env.SUPABASE_DB_URL, { max: 1, prepare: false }) : null;
const helper = readFileSync('drizzle/migrations/0140_admin_significant_problem_events.sql', 'utf8').split('REVOKE ALL')[0];
afterAll(async () => { await db?.end(); });

describe.skipIf(!db)('significant admin issues (connection-local SQL)', () => {
  async function significant(metadata: unknown) {
    if (!db) throw new Error('Missing SQL test connection');
    return db.begin(async sql => {
      await sql.unsafe(helper.replace('public.admin_is_significant_issue', 'pg_temp.admin_is_significant_issue'));
      const [row] = await sql`select pg_temp.admin_is_significant_issue(${sql.json(metadata as postgres.JSONValue)}) visible`;
      return row.visible;
    });
  }

  it.each(['turn_change_blocked', 'dice_result_fallback', 'dice_msg_ignored'])('hides routine %s even with a six-second-old snapshot', async kind => {
    expect(await significant({ kind, snapAgeMs: 6600 })).toBe(false);
  });
  it('hides a fast fallback but preserves actual waits above three seconds', async () => {
    expect(await significant({ kind: 'dice_result_fallback', waitedMs: 350 })).toBe(false);
    expect(await significant({ kind: 'dice_result_fallback', waitedMs: 3000 })).toBe(false);
    expect(await significant({ kind: 'dice_result_fallback', waitedMs: 3001 })).toBe(true);
    expect(await significant({ kind: 'turn_change_blocked', ms: 4000 })).toBe(true);
  });
  it('preserves a result arriving after the roll timeout', async () => {
    expect(await significant({ kind: 'dice_result_fallback', via: 'late_after_timeout' })).toBe(true);
  });
  it.each(['roll_failed', 'lock_error', 'submit_failed', 'score_mismatch', 'dice_value_jump', 'dice_slow_result'])('preserves meaningful %s', async kind => {
    expect(await significant({ kind })).toBe(true);
  });
  it('handles malformed timing without mistaking snapshot age for elapsed wait', async () => {
    expect(await significant({ kind: 'turn_change_blocked', waitedMs: 'unknown', ms: {}, snapAgeMs: 90000 })).toBe(false);
  });
  it('both deployed counters match independent filtered event counts for today', async () => {
    if (!db) throw new Error('Missing SQL test connection');
    await db.begin(async sql => {
      await sql.unsafe('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      for (const name of ['admin_issue_release', 'admin_is_significant_issue', 'admin_daily_stats_v3', 'admin_daily_extra_stats']) {
        const [row] = await sql`select pg_get_functiondef(oid) definition from pg_proc where pronamespace='public'::regnamespace and proname=${name}`;
        await sql.unsafe(row.definition.replace(/public\.admin_/g, 'pg_temp.admin_'));
      }
      const [expected] = await sql`
        with versions as (
          select app_version from public.analytics_sessions where platform in ('ios','android')
          union select app_version from public.analytics_events where platform in ('ios','android')
        ), latest as (select pg_temp.admin_issue_release(app_version) release from versions
          where pg_temp.admin_issue_release(app_version) is not null order by release desc limit 1)
        select count(*) n, count(distinct device_id) devices
        from public.analytics_events e
        where (created_at at time zone 'Europe/Stockholm')::date = (now() at time zone 'Europe/Stockholm')::date
          and event_name='mp_issue' and platform in ('ios','android') and device_id is not null
          and not exists(select 1 from public.excluded_stat_devices x where x.device_id=e.device_id)
          and pg_temp.admin_issue_release(app_version) in (select release from latest)
          and pg_temp.admin_is_significant_issue(metadata)`;
      const [actual] = await sql`select s.issues,e.issue_devices from pg_temp.admin_daily_stats_v3((now() at time zone 'Europe/Stockholm')::date) s
        join pg_temp.admin_daily_extra_stats((now() at time zone 'Europe/Stockholm')::date) e using(day)`;
      expect(Number(actual.issues)).toBe(Number(expected.n));
      expect(Number(actual.issue_devices)).toBe(Number(expected.devices));
    });
  });
  it('keeps the helper private to the protected admin service', async () => {
    if (!db) throw new Error('Missing SQL test connection');
    const [row] = await db`select has_function_privilege('anon','public.admin_is_significant_issue(jsonb)','EXECUTE') a,
      has_function_privilege('authenticated','public.admin_is_significant_issue(jsonb)','EXECUTE') b,
      has_function_privilege('service_role','public.admin_is_significant_issue(jsonb)','EXECUTE') c`;
    expect(row).toEqual({ a: false, b: false, c: true });
  });
});