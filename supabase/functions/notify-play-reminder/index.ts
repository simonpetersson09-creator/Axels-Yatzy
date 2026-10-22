// Cron-driven (hourly): recurring "come play" reminder for inactive players.
// claim_play_reminder_targets picks and claims targets atomically (7 days
// inactive, 18:00 in the device's timezone, max 1 per 7 days, paused after 3
// reminders without activity, play_reminders preference respected), so
// duplicate or concurrent runs can never double-send.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendPush, disableTokenIfStale } from "../_shared/apns.ts";
import { playReminderText } from "../_shared/play-reminder-copy.ts";

const json = (b: object, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const provided = (req.headers.get("x-internal-secret") ?? "").trim();
  if (!provided) return json({ error: "Unauthorized" }, 401);
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const envSecret = (Deno.env.get("INTERNAL_NOTIFY_SECRET") ?? "").trim();
  let ok = Boolean(envSecret) && provided === envSecret;
  if (!ok) {
    const { data } = await supabase.rpc("internal_secret_matches", { p_secret: provided });
    ok = data === true;
  }
  if (!ok) return json({ error: "Unauthorized" }, 401);

  const { data: targets, error } = await supabase.rpc("claim_play_reminder_targets");
  if (error) return json({ error: error.message }, 500);

  let sent = 0;
  await Promise.all((targets ?? []).map(async (t: any) => {
    const { title, body } = playReminderText(t.lang);
    const r = await sendPush({ platform: t.platform, deviceToken: t.token, title, body, data: { kind: "play_reminder" } });
    if (r.ok) sent++;
    else await disableTokenIfStale(supabase, t.token, r);
    await supabase.from("analytics_events").insert({
      event_name: "play_reminder_sent",
      device_id: t.device_id,
      local_user_id: t.device_id,
      metadata: { delivered: r.ok },
      platform: t.platform ?? "server",
      app_version: "1.0.0",
    });
  }));

  console.log(`[notify-play-reminder] targets=${targets?.length ?? 0} sent=${sent}`);
  return json({ targets: targets?.length ?? 0, sent });
});
