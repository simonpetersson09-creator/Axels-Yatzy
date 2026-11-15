import postgres from 'postgres';
import { afterAll, expect, it } from 'vitest';

const db = process.env.SUPABASE_DB_URL ? postgres(process.env.SUPABASE_DB_URL, { max: 1, prepare: false }) : null;
afterAll(async () => { await db?.end(); });

it.skipIf(!db)('optimized admin preserves every counter, age and incomplete flag from November 1 onwards', async () => {
  if (!db) throw new Error('Missing isolated SQL connection');
  await db.begin(async sql => {
    await sql.unsafe('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    // Read-only live inputs, connection-local functions: no production statistics are written.
    let optimizedDefinition = '';
    for (const name of ['admin_is_app_activity_event','admin_issue_release','admin_mean_app_age','admin_median_app_age','admin_daily_stats_v3','admin_daily_stats_v4','admin_daily_stats_v5','admin_daily_stats_v6']) {
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