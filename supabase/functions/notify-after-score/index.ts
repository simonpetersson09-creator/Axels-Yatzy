// Sends "your turn" pushes for scores saved directly in the database
// (client_submit_score). The database queues a row in turn_push_queue and pings
// this function; it drains the queue. Anyone may ping it, but it only acts on
// rows the database itself queued, and notify-turn-change is idempotent.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  try {
    const secret = Deno.env.get("INTERNAL_NOTIFY_SECRET") ?? "";
    const { data: rows } = await supabase.from("turn_push_queue")
      .delete().lt("created_at", new Date(Date.now() + 1000).toISOString())
      .select("game_id, sender_session_id");
    if (!secret || !rows?.length) return json({ sent: 0 });
    const seen = new Set<string>();
    await Promise.all(rows.filter((r) => {
      const k = `${r.game_id}|${r.sender_session_id}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).map((r) => supabase.functions.invoke("notify-turn-change", {
      body: { game_id: r.game_id, sender_session_id: r.sender_session_id },
      headers: { "x-internal-secret": secret },
    }).catch(() => {})));
    return json({ sent: seen.size });
  } catch (_e) {
    return json({ error: "Internt serverfel" }, 500);
  }
});
