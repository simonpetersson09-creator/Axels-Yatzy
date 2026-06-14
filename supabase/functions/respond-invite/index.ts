// Accept or decline a friend invite. On accept creates the game atomically.
// Either party can also cancel a pending invite by calling with action='decline'.
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
    const { invite_id, session_id, action } = await req.json();
    if (!invite_id || !session_id || !["accept", "decline"].includes(action)) {
      return json({ error: "invite_id, session_id, action(accept|decline) required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: invite } = await supabase
      .from("game_invites")
      .select("*")
      .eq("id", invite_id)
      .maybeSingle();
    if (!invite) return json({ error: "Inbjudan finns inte" }, 404);

    if (action === "accept") {
      const { data, error } = await supabase.rpc("accept_invite", {
        p_invite_id: invite_id,
        p_session_id: session_id,
      });
      if (error) return json({ error: error.message }, 500);
      const res = data as { success: boolean; error?: string; game_id?: string; game_code?: string };
      if (!res.success) return json({ error: res.error }, 400);

      // Push back to sender so they auto-navigate
      await pushToSession(supabase, invite.from_session_id, {
        title: "Inbjudan accepterad 🎲",
        body: `${invite.to_name} hoppade in i spelet`,
        data: { kind: "invite_accepted", game_id: res.game_id ?? "", invite_id },
      });
      return json({ success: true, action, game_id: res.game_id, game_code: res.game_code });
    }

    // decline (or cancel if caller is sender)
    const { data, error } = await supabase.rpc("decline_invite", {
      p_invite_id: invite_id,
      p_session_id: session_id,
    });
    if (error) return json({ error: error.message }, 500);
    const res = data as { success: boolean; error?: string; noop?: boolean };
    if (!res.success) return json({ error: res.error }, 400);

    if (!res.noop) {
      if (invite.to_session_id === session_id) {
        // Invitee declined → notify sender
        await pushToSession(supabase, invite.from_session_id, {
          title: "Inbjudan avböjd",
          body: `${invite.to_name} kan inte spela just nu`,
          data: { kind: "invite_declined", invite_id },
        });
      } else if (invite.from_session_id === session_id) {
        // Sender cancelled → notify recipient (silent data push closes overlay via realtime UPDATE)
        await pushToSession(supabase, invite.to_session_id, {
          title: "Inbjudan avbruten",
          body: `${invite.from_name} avbröt inbjudan`,
          data: { kind: "invite_cancelled", invite_id },
        });
      }
    }

    return json({ success: true, action });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
