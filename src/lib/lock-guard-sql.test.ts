import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { afterAll, expect, it } from 'vitest';

const db = process.env.SUPABASE_DB_URL ? postgres(process.env.SUPABASE_DB_URL, { max: 1, prepare: false }) : null;
afterAll(async () => { await db?.end(); });

it.skipIf(!db)('rejects a delayed lock after a roll or turn changes without touching newer locks', async () => {
  if (!db) throw new Error('Missing isolated SQL connection');
  await db.begin(async sql => {
    await sql.unsafe(`
      CREATE TEMP TABLE games(id uuid, status text, round integer, rolls_left integer, current_player_index integer, locked_dice boolean[]) ON COMMIT DROP;
      CREATE TEMP TABLE game_players(game_id uuid, session_id text, player_index integer, last_active_at timestamptz, away boolean) ON COMMIT DROP;
      CREATE OR REPLACE FUNCTION pg_temp.claim_session(text,text) RETURNS boolean LANGUAGE sql AS $$ SELECT $2='valid-device' $$;
    `);
    const setter = readFileSync('drizzle/migrations/0014_perform_set_locks.sql', 'utf8').match(/CREATE OR REPLACE FUNCTION[\s\S]*?\$function\$;/)?.[0];
    const guard = readFileSync('drizzle/migrations/0116_admin_release_materialization_and_guarded_locks.sql', 'utf8').match(/CREATE OR REPLACE FUNCTION public\.client_set_locks_guarded[\s\S]*?\$function\$;/)?.[0];
    if (!setter || !guard) throw new Error('Missing production SQL');
    for (const definition of [setter, guard]) {
      await sql.unsafe(definition.replace(/public\./g, 'pg_temp.').replace("SET search_path TO 'public'", "SET search_path TO 'pg_temp'"));
    }
    const id = '00000000-0000-0000-0000-000000000001';
    await sql`INSERT INTO pg_temp.games VALUES (${id},'playing',1,2,0,ARRAY[false,false,false,false,false])`;
    await sql`INSERT INTO pg_temp.game_players VALUES (${id},'player',0,now(),false)`;
    const call = async (round: number, rolls: number, player = 0, device = 'valid-device', locks = [true,false,false,false,false]) => {
      const [row] = await sql`SELECT pg_temp.client_set_locks_guarded(${id}::uuid,'player',${device},${locks}::boolean[],${round},${rolls},${player}) result`;
      return row.result;
    };
    expect(await call(1,2)).toMatchObject({ success: true, locked_dice: [true,false,false,false,false] });
    // A combined roll has now committed a new roll count and lock snapshot.
    await sql`UPDATE pg_temp.games SET rolls_left=1,locked_dice=ARRAY[false,true,false,false,false]`;
    expect(await call(1,2)).toMatchObject({ success: false, stale_command: true });
    expect((await sql`SELECT locked_dice FROM pg_temp.games`)[0].locked_dice).toEqual([false,true,false,false,false]);
    expect(await call(1,1,0,'wrong-device')).toMatchObject({ success: false, auth_failed: true });
    expect(await call(1,1,1)).toMatchObject({ success: false, stale_command: true });
    expect(await call(1,1)).toMatchObject({ success: true });
    await sql`UPDATE pg_temp.games SET round=2,locked_dice=ARRAY[false,true,false,false,false]`;
    expect(await call(1,1)).toMatchObject({ success: false, stale_command: true });
    expect((await sql`SELECT locked_dice FROM pg_temp.games`)[0].locked_dice).toEqual([false,true,false,false,false]);
    // The original unguarded setter is untouched for old app versions.
    const [legacy] = await sql`SELECT pg_temp.perform_set_locks(${id}::uuid,'player',ARRAY[true,false,false,false,false]) result`;
    expect(legacy.result.success).toBe(true);
  });
});