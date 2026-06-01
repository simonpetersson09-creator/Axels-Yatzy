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
      const { error } = await supabase.from("push_tokens").upsert(
        {
          device_id,
          session_id: session_id ?? null,
          platform,
          token,
          enabled: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "device_id,token" },
      );
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    if (action === "set_prefs") {
      const { device_id, turn_notifications, reminder_notifications } = body;
      if (!device_id) return json({ error: "device_id required" }, 400);
      const { error } = await supabase.from("notification_preferences").upsert({
        device_id,
        turn_notifications: !!turn_notifications,
        reminder_notifications: !!reminder_notifications,
        updated_at: new Date().toISOString(),
      });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    if (action === "mark_opened") {
      const { notification_id, device_id } = body;
      if (!notification_id || !device_id) return json({ error: "missing fields" }, 400);
      // Only mark opened if the device is actually the recipient.
      const { error } = await supabase
        .from("notification_log")
        .update({ opened_at: new Date().toISOString() })
        .eq("id", notification_id)
        .eq("recipient_device_id", device_id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    return json({ error: "unknown action" }, 400);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
