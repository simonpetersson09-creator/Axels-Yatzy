import { precheckDevice } from "../_shared/session-auth.ts";
import { logTiming } from "../_shared/timing.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// One client per function instance (reused across requests) — avoids
// rebuilding the database connection on every tap.
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  const t0 = performance.now();
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json();
    // Keep-warm ping (cron): touch the database so this instance is connected.
    if (body?.warm === true) {
      await supabase.from("games").select("id").limit(1);
      return json({ warm: true });
    }
    const { game_id, session_id, device_id, client_dice, server_rolls, locked_dice } = body;

    if (!game_id || !session_id) {
      return json({ error: "game_id and session_id required" }, 400);
    }


    // Device check runs inside the same database call as the roll.
    const owner = precheckDevice(session_id, device_id);
    if (!owner.ok) return json({ error: owner.error }, 403);

    // New app versions send server_rolls: true and the server rolls (fair
    // play). TEMPORARY: older versions (no flag) still get their own dice
    // accepted so their animation keeps matching. Remove this fallback once
    // most players have updated — until then the old path can be abused.
    let clientDice: number[] | null = null;
    if (
      server_rolls !== true &&
      Array.isArray(client_dice) &&
      client_dice.length === 5 &&
      client_dice.every((n) => Number.isInteger(n) && n >= 1 && n <= 6)
    ) {
      clientDice = client_dice as number[];
    }

    // Newer apps send the locks with the roll: one call, dice start at once.
    const withLocks = server_rolls === true && Array.isArray(locked_dice) &&
      locked_dice.length === 5 && locked_dice.every((b) => typeof b === "boolean");
    const dbStart = performance.now();
    const { data, error } = withLocks
      ? await supabase.rpc("perform_lock_and_roll_authed", {
          p_game_id: game_id,
          p_session_id: session_id,
          p_device_id: owner.device,
          p_locked: locked_dice,
        })
      : await supabase.rpc("perform_roll_dice_authed", {
          p_game_id: game_id,
          p_session_id: session_id,
          p_device_id: owner.device,
          p_client_dice: clientDice,
        });
    logTiming(supabase, req, "roll", game_id, t0, performance.now() - dbStart, !error && !!(data as { success?: boolean })?.success);

    if (error) {
      return json({ error: "Databasfel vid tärningskast" }, 500);
    }

    const result = data as { success: boolean; auth_failed?: boolean; error?: string; dice?: number[]; rolls_left?: number };
    if (result.auth_failed) return json({ error: result.error }, 403);

    if (!result.success) {
      return json({ error: result.error }, 400);
    }

    return json({ success: true, dice: result.dice, rolls_left: result.rolls_left });
  } catch (_err) {
    return json({ error: "Internt serverfel" }, 500);
  }
});
