// Called by the app (fire-and-forget) after a score saved directly in the
// database (client_submit_score), so the next player still gets a "your turn"
// push. Only a device-verified player of the game may trigger it; the push
// itself is idempotent per round/player in notify-turn-change.
import { verifySessionOwner } from "../_shared/session-auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const UUID = /^[0-9a-f-]{36}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  try {
    const { game_id, session_id, device_id } = await req.json().catch(() => ({}));
    if (typeof game_id !== "string" || !UUID.test(game_id) || typeof session_id !== "string" || typeof device_id !== "string") {
      return json({ error: "game_id, session_id, device_id required" }, 400);
    }
    const owner = await verifySessionOwner(supabase, session_id, device_id);
    if (!owner.ok) return json({ error: owner.error }, 403);
    const { data: pl } = await supabase.from("game_players").select("id")
      .eq("game_id", game_id).eq("session_id", session_id).maybeSingle();
    if (!pl) return json({ error: "not in game" }, 403);
    const secret = Deno.env.get("INTERNAL_NOTIFY_SECRET") ?? "";
    if (!secret) return json({ skipped: true });
    await supabase.functions.invoke("notify-turn-change", {
      body: { game_id, sender_session_id: session_id },
      headers: { "x-internal-secret": secret },
    });
    return json({ success: true });
  } catch (_e) {
    return json({ error: "Internt serverfel" }, 500);
  }
});
