import { supabase } from '@/integrations/supabase/client';
import { aiDecideLocks, aiPickCategory } from '@/lib/yatzy-ai';
import { rollSingleDie } from '@/lib/yatzy-scoring';

/**
 * Dev-only: plays one bot turn using the EXACT same path as the real app
 * (edge functions + `roll_started` broadcast + real animation timings), so the
 * dice and everything around them behave identically to "Spela med vän".
 */

export const BOT_ROLL_ANIM_MS = 1350;   // matches ROLL_ANIM_MS in useMultiplayerGame
const BOT_LOCK_DELAY_MS = 260;          // human-ish pause per lock tap
const BOT_THINK_MS = 180;               // short pause before picking a category
// The opponent's spin starts a bit later than ours (broadcast latency), so we
// let their animation land before the score submit changes the turn.
const BOT_SETTLE_MS = 420;

interface BotGame {
  id: string;
  status: string;
  current_player_index: number;
  dice: number[];
  locked_dice: boolean[];
  rolls_left: number;
}

interface BotPlayer {
  player_index: number;
  scores: Record<string, number | null>;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Subscribe to the same realtime channel the app uses, so the human sees the spin. */
async function openChannel(gameId: string) {
  const channel = supabase.channel(`yatzy-${gameId}`);
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    channel.subscribe((status) => { if (status === 'SUBSCRIBED') finish(); });
    setTimeout(finish, 2000);
  });
  return channel;
}

export async function playBotTurn(
  game: BotGame,
  player: BotPlayer,
  sessionId: string,
  log: (msg: string) => void = () => {},
): Promise<void> {
  const channel = await openChannel(game.id);
  try {
    let dice = game.dice;
    let rollsLeft = game.rolls_left;
    let locks = game.locked_dice;

    // Never `return` on a failed step — the bot must always finish its turn by
    // picking a category, otherwise the match freezes on its turn.
    rollLoop:
    while (rollsLeft > 0) {
      if (rollsLeft < 3) {
        const wanted = aiDecideLocks(dice, player.scores, rollsLeft);
        for (let i = 0; i < 5; i += 1) {
          if (wanted[i] !== locks[i]) {
            const { error } = await supabase.functions.invoke('toggle-lock', {
              body: { game_id: game.id, session_id: sessionId, dice_index: i },
            });
            if (error) { log(`Bot lås-fel: ${error.message}`); break rollLoop; }
            await wait(BOT_LOCK_DELAY_MS);
          }
        }
        locks = wanted;
      }

      // Same optimistic client_dice contract as the app.
      const willResetLocks = rollsLeft === 3;
      const optimisticLocked = willResetLocks ? [false, false, false, false, false] : locks;
      const optimisticDice = dice.map((prev, i) =>
        !willResetLocks && optimisticLocked[i] ? prev : rollSingleDie(),
      );
      const optimisticRollsLeft = rollsLeft - 1;

      try {
        await channel.send({
          type: 'broadcast',
          event: 'roll_started',
          payload: {
            player: player.player_index,
            dice: optimisticDice,
            lockedDice: optimisticLocked,
            rollsLeft: optimisticRollsLeft,
          },
        });
      } catch { /* non-fatal — postgres_changes fallback */ }

      const rollPromise = supabase.functions.invoke('roll-dice', {
        body: { game_id: game.id, session_id: sessionId, client_dice: optimisticDice },
      });
      // Let the opponent's spin animation run to completion, exactly like the app.
      const [{ data, error }] = await Promise.all([rollPromise, wait(BOT_ROLL_ANIM_MS)]);
      if (error) { log(`Bot roll-fel: ${error.message}`); break rollLoop; }

      dice = (data?.dice as number[] | undefined) ?? optimisticDice;
      rollsLeft = typeof data?.rolls_left === 'number' ? data.rolls_left : optimisticRollsLeft;
      locks = optimisticLocked;
      log(`Bot kastade: ${dice.join(' ')} (${rollsLeft} kast kvar)`);
    }

    await wait(BOT_THINK_MS + BOT_SETTLE_MS);

    // Use authoritative server state for the decision (the snapshot can be stale
    // if a roll failed or the realtime update arrived late).
    const [{ data: freshGame }, { data: freshPlayer }] = await Promise.all([
      supabase.from('games').select('dice, current_player_index, status, rolls_left').eq('id', game.id).maybeSingle(),
      supabase
        .from('game_players')
        .select('scores')
        .eq('game_id', game.id)
        .eq('session_id', sessionId)
        .maybeSingle(),
    ]);
    if (freshGame && (freshGame.status !== 'playing' || freshGame.current_player_index !== player.player_index)) {
      log('Bot: turen är inte längre botens — hoppar över poängval');
      return;
    }

    // The server refuses a score submission when no roll has happened this turn
    // ("Du måste kasta tärningarna först"). If every roll above failed, do one
    // last plain roll so the bot can always finish its turn.
    let serverDice = (freshGame?.dice as number[] | undefined) ?? dice;
    if (freshGame?.rolls_left === 3) {
      log('Bot: inget kast registrerat — kastar en gång till innan poängval');
      const { data: rollData, error: rollErr } = await supabase.functions.invoke('roll-dice', {
        body: { game_id: game.id, session_id: sessionId },
      });
      if (rollErr) { log(`Bot roll-fel (fallback): ${rollErr.message}`); return; }
      serverDice = (rollData?.dice as number[] | undefined) ?? serverDice;
      await wait(BOT_ROLL_ANIM_MS);
    }

    const finalDice = serverDice;
    const finalScores = (freshPlayer?.scores as Record<string, number | null> | undefined) ?? player.scores;

    const category = aiPickCategory(finalDice, finalScores);

    // Retry: a single transient network/rate-limit hiccup must not freeze the match.
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const { error } = await supabase.functions.invoke('submit-score', {
        body: { game_id: game.id, session_id: sessionId, category_id: category },
      });
      if (!error) { log(`Bot valde ${category}`); return; }
      log(`Bot poäng-fel (försök ${attempt}): ${error.message}`);
      console.warn('[dev-bot] submit-score failed', error);
      if (attempt < 3) await wait(600 * attempt);
    }
  } finally {
    void supabase.removeChannel(channel);
  }
}

