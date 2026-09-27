// Online quick matches (games.is_quick_match) only.
//
// Two modes:
//  1. Cron sweep (x-internal-secret): plays turns server-side for quick matches
//     where EVERY player has been silent for 60 s, so abandoned matches always
//     finish. When a player is still in the app, their client does the takeover.
//  2. Client call ({ game_id }): only sends the one-time "the computer is
//     playing your turn" push to the absent player, after verifying server-side
//     that the takeover condition really holds.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { pushToSession } from "../_shared/apns.ts";
import { aiDecideLocks, aiPickCategory } from "../_shared/yatzy/ai.ts";
import type { CategoryId } from "../_shared/yatzy/types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-internal-secret",
};

const IDLE_MS = 60_000;
const SWEEP_BUDGET_MS = 45_000;

// deno-lint-ignore no-explicit-any
type Sb = any;

interface PlayerRow {
  player_index: number;
  session_id: string;
  player_name: string;
  scores: Record<string, number | null>;
  last_active_at: string;
}

const idle = (p: PlayerRow) => Date.now() - new Date(p.last_active_at).getTime() >= IDLE_MS;

async function notifyTakeover(sb: Sb, gameId: string, p: PlayerRow) {
  const { data: existing } = await sb
    .from("notification_log")
    .select("id")
    .eq("game_id", gameId)
    .eq("recipient_session_id", p.session_id)
    .eq("kind", "takeover")
    .limit(1);
  if (existing && existing.length > 0) return;

  const title = "Datorn spelar din tur 🎲";
  const body = "Kom tillbaka och spela själv i din Yatzy-match!";
  const { data: row } = await sb
    .from("notification_log")
    .insert({
      game_id: gameId,
      recipient_session_id: p.session_id,
      kind: "takeover",
      player_index: p.player_index,
      delivered: false,
      metadata: { title, body },
    })
    .select("id")
    .single();
  const res = await pushToSession(sb, p.session_id, {
    title,
    body,
    data: { game_id: gameId, kind: "takeover" },
  }).catch(() => ({ delivered: false, deviceId: null }));
  if (row?.id) {
    await sb.from("notification_log")
      .update({ delivered: res.delivered, recipient_device_id: res.deviceId })
      .eq("id", row.id);
  }
}

/** Plays one full turn for the current player. Returns false if nothing was done. */
async function playTurn(sb: Sb, gameId: string): Promise<boolean> {
  const { data: game } = await sb.from("games").select("*").eq("id", gameId).maybeSingle();
  if (!game || game.status !== "playing" || !game.is_quick_match) return false;
  const { data: players } = await sb
    .from("game_players")
    .select("player_index, session_id, player_name, scores, last_active_at")
    .eq("game_id", gameId);
  const list = (players ?? []) as PlayerRow[];
  if (list.length === 0 || !list.every(idle)) return false; // someone is here → client handles it
  const cur = list.find((p) => p.player_index === game.current_player_index);
  if (!cur) return false;

  await notifyTakeover(sb, gameId, cur);

  let dice: number[] = game.dice;
  let rollsLeft: number = game.rolls_left;
  let locks: boolean[] = game.locked_dice;
  while (rollsLeft > 0) {
    if (rollsLeft < 3) {
      const wanted = aiDecideLocks(dice, cur.scores as Record<CategoryId, number | null>, rollsLeft);
      if (wanted.every(Boolean)) break;
      for (let i = 0; i < 5; i++) {
        if (wanted[i] !== locks[i]) {
          await sb.rpc("perform_toggle_lock", { p_game_id: gameId, p_session_id: cur.session_id, p_dice_index: i });
        }
      }
      locks = wanted;
    }
    const { data } = await sb.rpc("perform_roll_dice", { p_game_id: gameId, p_session_id: cur.session_id, p_client_dice: null });
    if (!data?.success) break;
    dice = data.dice;
    rollsLeft = data.rolls_left;
    if (rollsLeft === 2) locks = [false, false, false, false, false];
  }

  const { data: fresh } = await sb.from("games").select("dice, rolls_left, current_player_index, status").eq("id", gameId).single();
  if (!fresh || fresh.status !== "playing" || fresh.current_player_index !== cur.player_index) return false;
  if (fresh.rolls_left === 3) {
    const { data } = await sb.rpc("perform_roll_dice", { p_game_id: gameId, p_session_id: cur.session_id, p_client_dice: null });
    if (data?.dice) fresh.dice = data.dice;
  }
  const category = aiPickCategory(fresh.dice, cur.scores as Record<CategoryId, number | null>);
  const { data: res } = await sb.rpc("perform_submit_score", {
    p_game_id: gameId, p_session_id: cur.session_id, p_category_id: category,
  });
  return !!res?.success;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const secret = (Deno.env.get("INTERNAL_NOTIFY_SECRET") ?? "").trim();
  const provided = (req.headers.get("x-internal-secret") ?? "").trim();
  let isCron = !!secret && !!provided && provided === secret;
  if (!isCron && provided) {
    const { data } = await sb.rpc("internal_secret_matches", { p_secret: provided });
    isCron = data === true;
  }

  try {
    if (!isCron) {
      const { game_id } = await req.json().catch(() => ({}));
      if (typeof game_id !== "string") return json({ error: "game_id required" }, 400);
      const { data: game } = await sb.from("games").select("status, is_quick_match, current_player_index").eq("id", game_id).maybeSingle();
      if (!game?.is_quick_match || game.status !== "playing") return json({ skipped: true });
      const { data: cur } = await sb.from("game_players")
        .select("player_index, session_id, player_name, scores, last_active_at")
        .eq("game_id", game_id).eq("player_index", game.current_player_index).maybeSingle();
      if (!cur || !idle(cur as PlayerRow)) return json({ skipped: true });
      await notifyTakeover(sb, game_id, cur as PlayerRow);
      return json({ ok: true });
    }

    const started = Date.now();
    const { data: games } = await sb.from("games").select("id").eq("is_quick_match", true).eq("status", "playing").limit(50);
    let turns = 0;
    for (const g of games ?? []) {
      while (Date.now() - started < SWEEP_BUDGET_MS) {
        const ok = await playTurn(sb, g.id).catch((e) => { console.warn("[quick-match-bot]", e); return false; });
        if (!ok) break;
        turns++;
      }
      if (Date.now() - started >= SWEEP_BUDGET_MS) break;
    }
    return json({ ok: true, turns });
  } catch (e) {
    console.warn("[quick-match-bot] error", e);
    return json({ error: "internal" }, 500);
  }
});
