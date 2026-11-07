import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { afterAll, expect, it } from 'vitest';

const db = process.env.SUPABASE_DB_URL ? postgres(process.env.SUPABASE_DB_URL, { max: 1, prepare: false }) : null;
afterAll(async () => { await db?.end(); });

const fn = (file: string, name: string) => {
  const src = readFileSync(`drizzle/migrations/${file}`, 'utf8');
  const m = src.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$(function)?\\$;`));
  if (!m) throw new Error(`Missing ${name}`);
  return m[0].replace(/public\./g, 'pg_temp.').replace(/(?<!\.)internal_score_total\(/g, 'pg_temp.internal_score_total(').replace('FUNCTION pg_temp.pg_temp.', 'FUNCTION pg_temp.').replace(/SET search_path TO 'public'/g, "SET search_path TO 'pg_temp'");
};

it.skipIf(!db)('player card keeps online results after cleanup deletes the finished game', async () => {
  if (!db) throw new Error('Missing SQL connection');
  await db.begin(async sql => {
    await sql.unsafe(`
      CREATE TEMP TABLE session_owners(session_id text PRIMARY KEY, device_id text) ON COMMIT DROP;
      CREATE TEMP TABLE games(id uuid PRIMARY KEY, status text, round int, forfeited_by text, updated_at timestamptz DEFAULT now()) ON COMMIT DROP;
      CREATE TEMP TABLE game_players(game_id uuid, session_id text, is_bot boolean DEFAULT false, scores jsonb) ON COMMIT DROP;
      CREATE TEMP TABLE online_match_scores(game_id uuid, session_id text, total int, top int, players int, finished_at timestamptz, source text, PRIMARY KEY(game_id, session_id)) ON COMMIT DROP;
      CREATE TEMP TABLE player_country_stats(session_id text, games_played int, created_at timestamptz) ON COMMIT DROP;
      CREATE TEMP TABLE dice_progress(session_id text, tier text, yatzy_matches int) ON COMMIT DROP;
      CREATE TEMP TABLE referral_rewards(session_id text, gold_until timestamptz) ON COMMIT DROP;
      CREATE TEMP TABLE player_avatars(session_id text, image text) ON COMMIT DROP;
    `);
    await sql.unsafe(fn('0121_durable_online_player_scores.sql', 'internal_score_total'));
    await sql.unsafe(fn('0122_online_scores_archive_humans_only.sql', 'internal_archive_online_scores'));
    await sql.unsafe(fn('0121_durable_online_player_scores.sql', 'get_player_card'));
    await sql.unsafe(`CREATE TRIGGER t BEFORE DELETE ON pg_temp.games FOR EACH ROW EXECUTE FUNCTION pg_temp.internal_archive_online_scores()`);
    const id = '00000000-0000-0000-0000-0000000000a1';
    await sql`INSERT INTO pg_temp.session_owners VALUES ('a','da'),('b','db')`;
    await sql`INSERT INTO pg_temp.games(id,status,round) VALUES (${id},'finished',15)`;
    await sql`INSERT INTO pg_temp.game_players VALUES (${id},'a',false,'{"chance":250}'),(${id},'b',false,'{"chance":180}'),(${id},'bot',true,'{"chance":300}')`;
    const before = (await sql`SELECT pg_temp.get_player_card('a') c`)[0].c;
    await sql`DELETE FROM pg_temp.games WHERE id=${id}`;
    const after = (await sql`SELECT pg_temp.get_player_card('a') c`)[0].c;
    expect(after).toMatchObject({ online_matches: 1, online_wins: 0, best_score: 250 });
    expect(after.online_matches).toBe(before.online_matches);
    expect((await sql`SELECT count(*)::int n FROM pg_temp.online_match_scores`)[0].n).toBe(2);
  });
});
