import { precheckDevice } from "../_shared/session-auth.ts";
import { logTiming } from "../_shared/timing.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
    const { game_id, session_id, device_id, category_id, expected_dice } = await req.json();

    if (!game_id || !session_id || !category_id) {
      return json({ error: "game_id, session_id, and category_id required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Device check, dice check and scoring run in ONE database call.
    const pre = precheckDevice(session_id, device_id);
    if (!pre.ok) return json({ error: pre.error }, 403);
    const wantDiceCheck =
      Array.isArray(expected_dice) &&
      expected_dice.length === 5 &&
      expected_dice.every((n) => Number.isInteger(n) && n >= 1 && n <= 6);
    const dbStart = performance.now();
    const { data, error } = await supabase.rpc("perform_submit_score_authed", {
      p_game_id: game_id,
      p_session_id: session_id,
      p_device_id: pre.device,
      p_category_id: category_id,
      p_expected_dice: wantDiceCheck ? expected_dice : null,
    });
    logTiming(supabase, req, "score", game_id, t0, performance.now() - dbStart, !error && !!(data as { success?: boolean })?.success);

    if (error) {
      return json({ error: "Databasfel vid poängsparning" }, 500);
    }

    const result = data as { success: boolean; error?: string; auth_failed?: boolean; dice_mismatch?: boolean; dice?: number[]; score?: number; category_id?: string; game_over?: boolean };

    if (result.auth_failed) return json({ error: result.error }, 403);
    if (result.dice_mismatch) return json({ error: "dice_mismatch", dice: result.dice ?? [] }, 409);
    if (!result.success) {
      return json({ error: result.error }, 400);
    }

    // Background turn-change notification. Must use EdgeRuntime.waitUntil so the
    // promise survives after the Response is returned — plain fire-and-forget
    // gets killed by the Deno runtime and the push never reaches APNs.
    if (!result.game_over) {
      const internalSecret = Deno.env.get("INTERNAL_NOTIFY_SECRET") ?? "";
      if (internalSecret) {
        const notifyPromise = supabase.functions
          .invoke("notify-turn-change", {
            body: { game_id, sender_session_id: session_id },
            headers: { "x-internal-secret": internalSecret },
          })
          .catch((e) => console.warn("[submit-score] notify-turn-change failed", e));
        // @ts-ignore EdgeRuntime is provided by Supabase Edge Runtime
        if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
          // @ts-ignore
          EdgeRuntime.waitUntil(notifyPromise);
        }
      }
    }
    // game_over case: the AFTER UPDATE trigger on `games`
    // (trg_games_finished_record_match) records the friend_match_results row
    // server-side. No client/edge call needed here.

    return json({
      success: true,
      score: result.score,
      category_id: result.category_id,
      game_over: result.game_over,
    });
  } catch (_err) {
    return json({ error: "Internt serverfel" }, 500);
  }
});
