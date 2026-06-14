// Creates a friend invite + pushes APNs notification to the recipient.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { pushToSession } from "../_shared/apns.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (b: object, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { from_session_id, from_name, to_session_id, to_name } = await req.json();
    if (!from_session_id || !from_name || !to_session_id || !to_name) {
      return json({ error: "from_session_id, from_name, to_session_id, to_name required" }, 400);
    }
    if (from_session_id === to_session_id) {
      return json({ error: "Du kan inte bjuda in dig själv" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Block if sender already has 3 active games
    const { count: activeCount } = await supabase
      .from("game_players")
      .select("game_id, games!inner(status)", { count: "exact", head: true })
      .eq("session_id", from_session_id)
      .in("games.status", ["waiting", "playing"]);
    if ((activeCount ?? 0) >= 3) {
      return json({ error: "Du har redan 3 aktiva spel. Avsluta något först." }, 400);
    }

    // Expire stale invites; reuse existing pending invite if one already exists
    await supabase
      .from("game_invites")
      .update({ status: "expired" })
      .eq("status", "pending")
      .lt("expires_at", new Date().toISOString());

    const { data: existing } = await supabase
      .from("game_invites")
      .select("*")
      .eq("from_session_id", from_session_id)
      .eq("to_session_id", to_session_id)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    let invite = existing;
    if (!invite) {
      const { data: inserted, error: insErr } = await supabase
        .from("game_invites")
        .insert({
          from_session_id,
          from_name: String(from_name).slice(0, 20),
          to_session_id,
          to_name: String(to_name).slice(0, 20),
        })
        .select()
        .single();
      if (insErr) return json({ error: insErr.message }, 500);
      invite = inserted;
    }

    // Push to recipient
    const title = "Spelinbjudan 🎲";
    const body = `${from_name} vill spela Yatzy med dig`;
    const { delivered, deviceId } = await pushToSession(supabase, to_session_id, {
      title, body,
      category: "GAME_INVITE",
      data: { kind: "invite", invite_id: invite.id, from_name },
    });

    await supabase.from("analytics_events").insert({
      event_name: "invite_sent",
      device_id: deviceId,
      local_user_id: deviceId,
      metadata: { delivered, to_name },
      platform: "server",
      app_version: "1.0.0",
    });

    return json({ success: true, invite_id: invite.id, push_delivered: delivered });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
