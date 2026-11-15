import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
const db = process.env.SUPABASE_DB_URL ? postgres(process.env.SUPABASE_DB_URL, { max: 1, prepare: false }) : null;
afterAll(async () => { await db?.end(); });
const source = readFileSync('drizzle/migrations/0133_durable_match_and_ad_reward_receipts.sql','utf8');
const award = readFileSync('drizzle/migrations/0066_award_ad_xp_no_daily_cap.sql','utf8');
const previousYatzy = readFileSync('drizzle/migrations/0007_permanent_dice_tiers.sql','utf8')
  .match(/CREATE OR REPLACE FUNCTION public\.record_local_yatzy_match[\s\S]*?END \$\$;/)?.[0];
describe.skipIf(!db)('release receipts — temporary tables only, no production awards', () => {
  async function scenario(check: (sql: postgres.TransactionSql) => Promise<void>) {
    if (!db) throw new Error('Missing test connection');
    await db.begin(async sql => {
      await sql.unsafe(`
        CREATE TEMP TABLE session_owners(session_id text PRIMARY KEY,device_id text) ON COMMIT DROP;
        CREATE TEMP TABLE player_xp(session_id text PRIMARY KEY,xp integer DEFAULT 0,earned_today integer DEFAULT 0,earned_day date DEFAULT current_date,last_earned_at timestamptz,updated_at timestamptz) ON COMMIT DROP;
        CREATE TEMP TABLE yatzy_match_log(session_id text,match_key text,PRIMARY KEY(session_id,match_key)) ON COMMIT DROP;
        CREATE TEMP TABLE player_country_stats(session_id text,country text) ON COMMIT DROP;
        CREATE TEMP TABLE weekly_hall_of_fame(session_id text,week_start date,first_name text,country text,best_score integer,games_played integer,best_at timestamptz,updated_at timestamptz,PRIMARY KEY(session_id,week_start)) ON COMMIT DROP;
        CREATE OR REPLACE FUNCTION pg_temp.claim_session(text,text) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM pg_temp.session_owners WHERE session_id=$1 AND device_id=$2) $$;
        CREATE OR REPLACE FUNCTION pg_temp.check_rate_limit(text,integer) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
        CREATE OR REPLACE FUNCTION pg_temp.internal_add_yatzy_match(text,text) RETURNS boolean LANGUAGE plpgsql AS $$ BEGIN INSERT INTO pg_temp.yatzy_match_log VALUES($1,$2) ON CONFLICT DO NOTHING; RETURN FOUND; END $$;
        CREATE OR REPLACE FUNCTION pg_temp.internal_hof_rank(text) RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;
        CREATE OR REPLACE FUNCTION pg_temp.internal_hof_week() RETURNS date LANGUAGE sql AS $$ SELECT date_trunc('week',now() AT TIME ZONE 'Europe/Stockholm')::date $$;
      `);
      for (const table of source.match(/CREATE TABLE public\.[\s\S]*?\n\);/g) ?? []) {
        await sql.unsafe(table.replace('CREATE TABLE public.','CREATE TEMP TABLE ').replace(/public\./g,'pg_temp.').replace(/\);$/,') ON COMMIT DROP;'));
      }
      // Replay the real existing definition before replacing it: parameter-name
      // incompatibilities must fail here, not be hidden by a fresh function.
      if (!previousYatzy) throw new Error('Missing previous Yatzy definition');
      await sql.unsafe(previousYatzy.replace(/public\./g,'pg_temp.').replace("SET search_path TO 'public'","SET search_path TO 'pg_temp'"));
      for (const fn of (award+'\n'+source).match(/CREATE OR REPLACE FUNCTION[\s\S]*?\$function\$;/g) ?? []) {
        await sql.unsafe(fn.replace(/public\./g,'pg_temp.').replace("SET search_path TO 'public'","SET search_path TO 'pg_temp'"));
      }
      await sql.unsafe("INSERT INTO pg_temp.session_owners VALUES('me','device-a'); INSERT INTO pg_temp.player_xp(session_id,xp) VALUES('me',7);");
      await check(sql);
    });
  }
  it('pays exactly 1 XP per receipt, protects beyond cooldown, rejects another device and cascades deletion', async () => {
    await scenario(async sql => {
      const id='eaf1264e-0704-40eb-90b9-d8a8257d7ba6';
      const call = async (device='device-a') => (await sql`SELECT pg_temp.award_ad_xp_receipted('me',${device},${id}::uuid) AS result`)[0].result;
      expect(await call('other')).toMatchObject({ok:false,reason:'auth'});
      expect(await call()).toMatchObject({ok:true,xp:8});
      await sql.unsafe("UPDATE pg_temp.player_xp SET last_earned_at=now()-interval '1 day';");
      expect(await call()).toMatchObject({ok:true,duplicate:true,xp:8});
      expect((await sql.unsafe('SELECT count(*)::integer n FROM pg_temp.ad_xp_receipts'))[0].n).toBe(1);
      await sql.unsafe("DELETE FROM pg_temp.player_xp WHERE session_id='me';");
      expect((await sql.unsafe('SELECT count(*)::integer n FROM pg_temp.ad_xp_receipts'))[0].n).toBe(0);
    });
  });
  it('keeps the 15-second unpaid cooldown distinct from duplicate payment', async () => {
    await scenario(async sql => {
      await sql.unsafe("UPDATE pg_temp.player_xp SET last_earned_at=now();");
      const row=(await sql.unsafe("SELECT pg_temp.award_ad_xp_receipted('me','device-a','eaf1264e-0704-40eb-90b9-d8a8257d7ba6') result"))[0];
      expect(row.result).toMatchObject({ok:false,reason:'cooldown',xp:7});
      expect((await sql.unsafe('SELECT count(*)::integer n FROM pg_temp.ad_xp_receipts'))[0].n).toBe(0);
    });
  });
  it('counts a completed report once and assigns an offline match to its Stockholm completion week', async () => {
    await scenario(async sql => {
      const call=async (device='device-a') => (await sql`SELECT pg_temp.report_weekly_score_receipted('me',${device},'local:match','Simon',250,now()-interval '8 days','SE') result`)[0].result;
      expect(await call('other')).toMatchObject({ok:false});
      expect(await call()).toMatchObject({ok:true,current_week:false});
      expect(await call()).toMatchObject({ok:true,duplicate:true});
      const row=(await sql.unsafe("SELECT games_played,best_score,week_start=date_trunc('week',(now()-interval '8 days') AT TIME ZONE 'Europe/Stockholm')::date AS correct_week FROM pg_temp.weekly_hall_of_fame"))[0];
      expect(row).toMatchObject({games_played:1,best_score:250,correct_week:true});
      await sql.unsafe("DELETE FROM pg_temp.session_owners WHERE session_id='me'");
      expect((await sql.unsafe('SELECT count(*)::integer n FROM pg_temp.match_report_receipts'))[0].n).toBe(0);
    });
  });
  it('acknowledges an already accepted Yatzy without registering it again', async () => {
    await scenario(async sql => {
      const call=async () => (await sql.unsafe("SELECT pg_temp.record_local_yatzy_match('me','device-a','sp:local:match') result"))[0].result;
      expect(await call()).toMatchObject({ok:true});
      expect(await call()).toMatchObject({ok:true,duplicate:true});
      expect((await sql.unsafe('SELECT count(*)::integer n FROM pg_temp.yatzy_match_log'))[0].n).toBe(1);
    });
  });
});