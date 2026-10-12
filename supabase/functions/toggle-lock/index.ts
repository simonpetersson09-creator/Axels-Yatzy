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
    const { game_id, session_id, device_id, dice_index, locked_dice } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // New app versions send the whole lock state in one call (batched taps).
    if (locked_dice !== undefined) {
      if (!game_id || !session_id || !Array.isArray(locked_dice) || locked_dice.length !== 5 || !locked_dice.every((b) => typeof b === "boolean")) {
        return json({ error: "game_id, session_id and locked_dice[5] required" }, 400);
      }
      const pre = precheckDevice(session_id, device_id);
      if (!pre.ok) return json({ error: pre.error }, 403);
      // Device check runs inside the same database call as the locks.
      const dbStart = performance.now();
      const { data, error } = await supabase.rpc("perform_set_locks_authed", {
        p_game_id: game_id,
        p_session_id: session_id,
        p_device_id: pre.device,
        p_locked: locked_dice,
      });
      logTiming(supabase, req, "locks", game_id, t0, performance.now() - dbStart, !error && !!(data as { success?: boolean })?.success);
      if (error) return json({ error: "Databasfel vid låsning" }, 500);
      const r = data as { success: boolean; auth_failed?: boolean; error?: string; locked_dice?: boolean[] };
      if (r.auth_failed) return json({ error: r.error }, 403);
      if (!r.success) return json({ error: r.error }, 400);
      return json({ success: true, locked_dice: r.locked_dice });
    }

    const pre = precheckDevice(session_id, device_id);
    if (!pre.ok) return json({ error: pre.error }, 403);

    // Older app versions: one toggle per tap.
    if (!game_id || !session_id || dice_index === undefined || dice_index === null) {
      return json({ error: "game_id, session_id and dice_index required" }, 400);
    }

    if (typeof dice_index !== "number" || !Number.isInteger(dice_index) || dice_index < 0 || dice_index > 4) {
      return json({ error: "dice_index must be an integer between 0 and 4" }, 400);
    }

    const dbStart = performance.now();
    const { data, error } = await supabase.rpc("perform_toggle_lock_authed", {
      p_game_id: game_id,
      p_session_id: session_id,
      p_device_id: pre.device,
      p_dice_index: dice_index,
    });
    logTiming(supabase, req, "lock", game_id, t0, performance.now() - dbStart, !error && !!(data as { success?: boolean })?.success);

    if (error) {
      return json({ error: "Databasfel vid låsning" }, 500);
    }

    const result = data as { success: boolean; auth_failed?: boolean; error?: string; locked_dice?: boolean[] };

    if (result.auth_failed) return json({ error: result.error }, 403);
    if (!result.success) {
      return json({ error: result.error }, 400);
    }

    return json({ success: true, locked_dice: result.locked_dice });
  } catch (_err) {
    return json({ error: "Internt serverfel" }, 500);
  }
});
