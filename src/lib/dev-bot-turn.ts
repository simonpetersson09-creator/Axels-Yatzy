import { supabase } from '@/integrations/supabase/client';
import { aiDecideLocks, aiPickCategory } from '@/lib/yatzy-ai';

/**
 * Dev-only: plays one bot turn using the EXACT same path as the real app
 * (edge functions + `roll_started` broadcast + real animation timings), so the
 * dice and everything around them behave identically to "Spela med vän".
 */

export const BOT_ROLL_ANIM_MS = 1500;   // matches ROLL_ANIM_MS in useMultiplayerGame
const BOT_LOCK_DELAY_MS = 260;          // human-ish pause per lock tap
const BOT_THINK_MS = 700;               // pause before picking a category

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

    while (rollsLeft > 0) {
      if (rollsLeft < 3) {
        const wanted = aiDecideLocks(dice, player.scores, rollsLeft);
        for (let i = 0; i < 5; i += 1) {
          if (wanted[i] !== locks[i]) {
            const { error } = await supabase.functions.invoke('toggle-lock', {
              body: { game_id: game.id, session_id: sessionId, dice_index: i },
            });
            if (error) { log(`Bot lås-fel: ${error.message}`); return; }
            await wait(BOT_LOCK_DELAY_MS);
          }
        }
        locks = wanted;
      }

      // Same optimistic client_dice contract as the app.
      const willResetLocks = rollsLeft === 3;
      const optimisticLocked = willResetLocks ? [false, false, false, false, false] : locks;
      const optimisticDice = dice.map((prev, i) =>
        !willResetLocks && optimisticLocked[i] ? prev : 1 + Math.floor(Math.random() * 6),
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
      if (error) { log(`Bot roll-fel: ${error.message}`); return; }

      dice = (data?.dice as number[] | undefined) ?? optimisticDice;
      rollsLeft = typeof data?.rolls_left === 'number' ? data.rolls_left : optimisticRollsLeft;
      locks = optimisticLocked;
      log(`Bot kastade: ${dice.join(' ')} (${rollsLeft} kast kvar)`);
    }

    await wait(BOT_THINK_MS);
    const category = aiPickCategory(dice, player.scores);
    const { error } = await supabase.functions.invoke('submit-score', {
      body: { game_id: game.id, session_id: sessionId, category_id: category },
    });
    if (error) log(`Bot poäng-fel: ${error.message}`);
    else log(`Bot valde ${category}`);
  } finally {
    void supabase.removeChannel(channel);
  }
}
