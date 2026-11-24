import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { afterAll, expect, it } from 'vitest';

const db = process.env.SUPABASE_DB_URL ? postgres(process.env.SUPABASE_DB_URL, { max: 1, prepare: false }) : null;
afterAll(async () => { await db?.end(); });

it.skipIf(!db)('optimized admin preserves every counter, age and incomplete flag from November 1 onwards', async () => {
  if (!db) throw new Error('Missing isolated SQL connection');
  await db.begin(async sql => {
    await sql.unsafe('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    // Read-only live inputs, connection-local functions: no production statistics are written.
    let optimizedDefinition = '';
    for (const name of ['admin_is_app_activity_event','admin_issue_release','admin_is_significant_issue','admin_mean_app_age','admin_median_app_age','admin_daily_stats_v3','admin_daily_stats_v4','admin_daily_stats_v5','admin_daily_stats_v6']) {
      const [row] = await sql`SELECT pg_get_functiondef(oid) definition FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=${name}`;
      if (name === 'admin_daily_stats_v3') optimizedDefinition = row.definition;
      await sql.unsafe(row.definition.replace(/public\.admin_/g, 'pg_temp.admin_'));
    }
    const optimized = await sql`SELECT * FROM pg_temp.admin_daily_stats_v6('2026-11-01')`;
    // Compare only the optimization, not obsolete rules from an older migration.
    // In particular, keep the deployed reminder exclusion and all history fixes.
    const originalDefinition = optimizedDefinition.replace(/AS MATERIALIZED/gi, 'AS NOT MATERIALIZED');
    expect(originalDefinition).not.toBe(optimizedDefinition);
    await sql.unsafe(originalDefinition.replace(/public\.admin_/g, 'pg_temp.admin_'));
    const original = await sql`SELECT * FROM pg_temp.admin_daily_stats_v6('2026-11-01')`;
    expect(optimized.length).toBeGreaterThan(0);
    expect(optimized).toEqual(original);
    expect(optimized.every(row => new Date(row.day).toISOString().slice(0,10) >= '2026-11-01')).toBe(true);
  });
}, 60000);

it.skipIf(!db)('fast admin keeps all daily values identical and retains server-only access', async () => {
  if (!db) throw new Error('Missing SQL connection');
  await db.begin(async sql => {
    await sql.unsafe('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await sql.unsafe("SET LOCAL statement_timeout='90s'");
    for (const name of ['admin_is_app_activity_event','admin_issue_release','admin_is_significant_issue','admin_mean_app_age','admin_median_app_age','admin_daily_stats_v3','admin_daily_stats_v4','admin_daily_stats_v5','admin_daily_stats_v6','admin_daily_extra_stats','admin_daily_stats_v7','admin_daily_returning_players','admin_daily_stats_v8']) {
      const [row] = await sql`SELECT pg_get_functiondef(oid) definition FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=${name}`;
      await sql.unsafe(row.definition.replace(/public\.admin_/g, 'pg_temp.admin_'));
    }
    // Reconstruct the previous execution settings/read, not previous counting rules.
    await sql.unsafe("ALTER FUNCTION pg_temp.admin_is_app_activity_event(text) SET search_path TO 'public'; ALTER FUNCTION pg_temp.admin_daily_stats_v8(date) SET jit TO 'on'");
    const [extra] = await sql`SELECT pg_get_functiondef('pg_temp.admin_daily_extra_stats(date)'::regprocedure) definition`;
    const optimizedRead = "SELECT e.id,e.device_id,e.created_at,e.event_name,e.metadata,e.app_version FROM analytics_events e WHERE e.event_name IN ('game_started','quick_match_started','game_finished','quick_match_online_matched','mp_issue','post_match_exit') AND";
    await sql.unsafe(extra.definition.replace(optimizedRead, 'SELECT e.* FROM analytics_events e WHERE'));
    const beforeStart = performance.now();
    const before = await sql`SELECT * FROM pg_temp.admin_daily_stats_v8('2026-11-01')`;
    const beforeMs = performance.now() - beforeStart;
    const migration = readFileSync('drizzle/migrations/0143_admin_faster_statistics.sql','utf8').split('REVOKE ALL')[0];
    await sql.unsafe(migration.replace(/public\.admin_/g, 'pg_temp.admin_'));
    const afterStart = performance.now();
    const after = await sql`SELECT * FROM pg_temp.admin_daily_stats_v8('2026-11-01')`;
    console.info('Admin calculation milliseconds', { before: Math.round(beforeMs), after: Math.round(performance.now() - afterStart) });
    expect(before.length).toBeGreaterThan(0);
    expect(after).toEqual(before);
    // Running the same migration twice is safe and preserves values.
    await sql.unsafe(migration.replace(/public\.admin_/g, 'pg_temp.admin_'));
    expect(await sql`SELECT * FROM pg_temp.admin_daily_stats_v8('2026-11-01')`).toEqual(before);
    for (const name of ['admin_daily_stats_v8', 'admin_daily_extra_stats']) {
      const [access] = await sql`SELECT has_function_privilege('anon',${`public.${name}(date)`},'EXECUTE') anon,has_function_privilege('authenticated',${`public.${name}(date)`},'EXECUTE') authenticated,has_function_privilege('service_role',${`public.${name}(date)`},'EXECUTE') server`;
      expect(access).toEqual({ anon: false, authenticated: false, server: true });
    }
  });
}, 120000);