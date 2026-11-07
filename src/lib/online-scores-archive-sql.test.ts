import postgres from 'postgres';
import { afterAll, expect, it } from 'vitest';

const db = process.env.SUPABASE_DB_URL ? postgres(process.env.SUPABASE_DB_URL, { max: 1, prepare: false }) : null;
afterAll(async () => { await db?.end(); });

const ROLLBACK = new Error('rollback');

it.skipIf(!db)('player card keeps online results after cleanup deletes the finished game', async () => {
  if (!db) throw new Error('Missing SQL connection');
  await db.begin(async sql => {
    const a = `test-a-${crypto.randomUUID()}`, b = `test-b-${crypto.randomUUID()}`;
    await sql`INSERT INTO session_owners(session_id, device_id) VALUES (${a}, ${'dev-' + a}), (${b}, ${'dev-' + b})`;
    const [g] = await sql`INSERT INTO games(game_code, status, round) VALUES (${'T' + Date.now()}, 'playing', 15) RETURNING id`;
    await sql`INSERT INTO game_players(game_id, player_name, player_index, session_id, scores)
      VALUES (${g.id}, 'A', 0, ${a}, '{"chance": 250}'::jsonb), (${g.id}, 'B', 1, ${b}, '{"chance": 180}'::jsonb)`;
    await sql`UPDATE games SET status='finished' WHERE id=${g.id}`;
    await sql`DELETE FROM games WHERE id=${g.id}`;
    const [{ card }] = await sql`SELECT get_player_card(${a}) card`;
    expect(card).toMatchObject({ online_matches: 1, online_wins: 1, best_score: 250 });
    const [{ card: other }] = await sql`SELECT get_player_card(${b}) card`;
    expect(other).toMatchObject({ online_matches: 1, online_wins: 0, best_score: 180 });
    throw ROLLBACK;
  }).catch((e) => { if (e !== ROLLBACK) throw e; });
});
