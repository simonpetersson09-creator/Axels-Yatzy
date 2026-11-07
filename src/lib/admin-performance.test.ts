import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { afterAll, expect, it } from 'vitest';

const db = process.env.SUPABASE_DB_URL ? postgres(process.env.SUPABASE_DB_URL, { max: 1, prepare: false }) : null;
afterAll(async () => { await db?.end(); });

it.skipIf(!db)('optimized admin preserves every counter, age and incomplete flag from November 1 onwards', async () => {
  if (!db) throw new Error('Missing isolated SQL connection');
  await db.begin(async sql => {
    // Read-only live inputs, connection-local functions: no production statistics are written.
    for (const name of ['admin_issue_release','admin_mean_app_age','admin_median_app_age','admin_daily_stats_v3','admin_daily_stats_v4','admin_daily_stats_v5','admin_daily_stats_v6']) {
      const [row] = await sql`SELECT pg_get_functiondef(oid) definition FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=${name}`;
      await sql.unsafe(row.definition.replace(/public\.admin_/g, 'pg_temp.admin_'));
    }
    const optimized = await sql`SELECT * FROM pg_temp.admin_daily_stats_v6('2026-11-01')`;
    const old = readFileSync('drizzle/migrations/0114_admin_history_survives_cleanup.sql','utf8').match(/CREATE OR REPLACE FUNCTION public\.admin_daily_stats_v3[\s\S]*?\$function\$;/)?.[0];
    if (!old) throw new Error('Missing pre-optimization definition');
    await sql.unsafe(old.replace(/public\.admin_/g, 'pg_temp.admin_'));
    const original = await sql`SELECT * FROM pg_temp.admin_daily_stats_v6('2026-11-01')`;
    expect(optimized.length).toBeGreaterThan(0);
    expect(optimized).toEqual(original);
    expect(optimized.every(row => row.day >= '2026-11-01')).toBe(true);
  });
}, 60000);