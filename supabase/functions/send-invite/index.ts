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
    const { from_session_id, from_name, to_session_id, to_name, device_id } = await req.json();
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

    // Caller must prove the sender session is theirs (device-bound ownership).
    // No fallback: knowing a public session id is not enough to send as it.
    if (typeof device_id !== "string" || device_id.length < 8 || device_id.length > 64) {
      return json({ error: "Ogiltig avsändare" }, 403);
    }

    // Independent checks run in parallel to keep the invite button snappy.
    const [ownsRes, recipientRes, senderGamesRes, activeRes] = await Promise.all([
      // Verify an EXISTING ownership only; never claim an unowned session here,
      // otherwise anyone could adopt a fresh session id and send invites as it.
      supabase.from("session_owners").select("device_id").eq("session_id", from_session_id).maybeSingle(),
      supabase.from("session_owners").select("session_id").eq("session_id", to_session_id).maybeSingle(),
      supabase
        .from("game_players")
        .select("game_id, player_name, joined_at")
        .eq("session_id", from_session_id)
        .order("joined_at", { ascending: false })
        .limit(200),
      supabase
        .from("game_players")
        .select("game_id, games!inner(status)")
        .eq("session_id", from_session_id)
        .in("games.status", ["waiting", "playing"]),
    ]);

    if (ownsRes.error || !ownsRes.data || ownsRes.data.device_id !== device_id) {
      return json({ error: "Ogiltig avsändare" }, 403);
    }
    // Recipient must be a real app install (claimed session), not an arbitrary id.
    if (!recipientRes.data) return json({ error: "Mottagaren hittades inte" }, 404);

    // Only players who have actually shared a game can invite each other,
    // and the sender name shown to the recipient comes from the server.
    const senderGames = senderGamesRes.data ?? [];
    const senderGameIds = senderGames.map((r: { game_id: string }) => r.game_id);
    if (senderGameIds.length === 0) return json({ error: "Ni har inte spelat tillsammans" }, 403);

    const nowIso = new Date().toISOString();
    const [sharedRes, existingRes] = await Promise.all([
      supabase
        .from("game_players")
        .select("game_id")
        .eq("session_id", to_session_id)
        .in("game_id", senderGameIds)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("game_invites")
        .select("*")
        .eq("from_session_id", from_session_id)
        .eq("to_session_id", to_session_id)
        .eq("status", "pending")
        .gt("expires_at", nowIso)
        .maybeSingle(),
    ]);
    if (!sharedRes.data) return json({ error: "Ni har inte spelat tillsammans" }, 403);
    const serverName = String(senderGames[0]?.player_name ?? "")
      .replace(/[\u0000-\u001F\u007F<>]/g, "").trim().slice(0, 20) || "En vän";

    // Block if sender already has 3 active games (distinct game_ids)
    const activeCount = new Set((activeRes.data ?? []).map((r: { game_id: string }) => r.game_id)).size;
    if (activeCount >= 3) {
      return json({ error: "Du har redan 3 aktiva spel. Avsluta något först." }, 400);
    }

    // Rate limits (per device, sender and recipient) — checked only after the
    // request is otherwise valid so rejected calls don't burn the window.
    const [devOk, fromOk, toOk] = await Promise.all([
      supabase.rpc("check_rate_limit", { p_key: `invite_device:${device_id}`, p_min_interval_seconds: 10 }),
      supabase.rpc("check_rate_limit", { p_key: `invite_from:${from_session_id}`, p_min_interval_seconds: 20 }),
      supabase.rpc("check_rate_limit", { p_key: `invite_to:${to_session_id}`, p_min_interval_seconds: 20 }),
    ]);
    if (devOk.data !== true || fromOk.data !== true || toOk.data !== true) {
      return json({ error: "För många inbjudningar. Försök igen om en stund." }, 429);
    }

    let invite = existingRes.data;
    if (!invite) {
      const { data: inserted, error: insErr } = await supabase
        .from("game_invites")
        .insert({
          from_session_id,
          from_name: serverName,
          to_session_id,
          to_name: String(to_name).slice(0, 20),
        })
        .select()
        .single();
      if (insErr) return json({ error: insErr.message }, 500);
      invite = inserted;
    }

    // Push + housekeeping run after the response so the sender isn't kept
    // waiting on Apple/Google.
    const safeName = serverName;
    const inviteId = invite.id;
    const background = (async () => {
      try {
        await supabase
          .from("game_invites")
          .update({ status: "expired" })
          .eq("status", "pending")
          .lt("expires_at", new Date().toISOString());
        const { delivered, deviceId } = await pushToSession(supabase, to_session_id, {
          title: `${safeName} utmanar dig 🎲`,
          body: `Tryck för att spela Yatzy`,
          data: { kind: "invite", invite_id: inviteId, from_name: safeName },
        });
        await supabase.from("analytics_events").insert({
          event_name: "invite_sent",
          device_id: deviceId,
          local_user_id: deviceId,
          metadata: { delivered, to_name },
          platform: "server",
          app_version: "1.0.0",
        });
      } catch (e) {
        console.error("send-invite background failed", e);
      }
    })();
    // deno-lint-ignore no-explicit-any
    const rt = (globalThis as any).EdgeRuntime;
    if (rt?.waitUntil) rt.waitUntil(background);
    else await background;

    return json({ success: true, invite_id: inviteId });
  } catch (err) {
    console.error("send-invite failed", err);
    return json({ error: "Internt serverfel" }, 500);
  }
});
