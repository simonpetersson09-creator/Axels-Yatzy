// Server-side writes for notification-related tables. Replaces direct client
// access so we can lock down RLS on push_tokens, notification_preferences and
// notification_log. All writes are scoped to the caller-supplied device_id /
// session_id, which the client already controls.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action as string;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (action === "register_token") {
      const { device_id, session_id, platform, token } = body;
      if (!device_id || !token || !platform) return json({ error: "missing fields" }, 400);

      // Anti-hijack: session_id is publicly readable from game_players, so we
      // never trust a client-supplied session_id at face value. The session
      // must be claimed by THIS device in the server-side ownership registry
      // (claimed at app start by the legitimate device that generated it).
      let safe_session_id: string | null = session_id ?? null;
      if (safe_session_id) {
        const { data: owns, error: claimErr } = await supabase.rpc("claim_session", {
          p_session_id: safe_session_id,
          p_device_id: device_id,
        });
        if (claimErr || owns !== true) {
          // Not our session — register the token without any session binding.
          safe_session_id = null;
        }
      }


      const { error } = await supabase.from("push_tokens").upsert(
        {
          device_id,
          session_id: safe_session_id,
          platform,
          token,
          enabled: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "device_id,token" },
      );
      if (error) { console.error("notifications-write", error); return json({ error: "Internt serverfel" }, 500); }
      return json({ ok: true });
    }

    // Caller must prove it controls device_id: the session it sends must be
    // bound to that exact device in the server-side ownership registry.
    const ownsDevice = async (device_id: unknown, session_id: unknown): Promise<boolean> => {
      if (typeof device_id !== "string" || device_id.length < 8 || device_id.length > 64) return false;
      if (typeof session_id !== "string" || session_id.length < 8 || session_id.length > 64) return false;
      const { data } = await supabase
        .from("session_owners")
        .select("device_id")
        .eq("session_id", session_id)
        .maybeSingle();
      return !!data && data.device_id === device_id;
    };

    if (action === "set_prefs") {
      const { device_id, turn_notifications, reminder_notifications } = body;
      if (!(await ownsDevice(device_id, body.session_id))) return json({ error: "Unauthorized" }, 403);
      const { error } = await supabase.from("notification_preferences").upsert({
        device_id,
        turn_notifications: !!turn_notifications,
        reminder_notifications: !!reminder_notifications,
        updated_at: new Date().toISOString(),
      });
      if (error) { console.error("notifications-write", error); return json({ error: "Internt serverfel" }, 500); }
      return json({ ok: true });
    }

    if (action === "mark_opened") {
      const { notification_id, device_id } = body;
      if (!notification_id || typeof notification_id !== "string") return json({ error: "missing fields" }, 400);
      if (!(await ownsDevice(device_id, body.session_id))) return json({ error: "Unauthorized" }, 403);
      // Only mark opened if the device is actually the recipient.
      const { error } = await supabase
        .from("notification_log")
        .update({ opened_at: new Date().toISOString() })
        .eq("id", notification_id)
        .eq("recipient_device_id", device_id);
      if (error) { console.error("notifications-write", error); return json({ error: "Internt serverfel" }, 500); }
      return json({ ok: true });
    }

    return json({ error: "unknown action" }, 400);
  } catch (err) {
    console.error("notifications-write failed", err);
    return json({ error: "Internt serverfel" }, 500);
  }
});
