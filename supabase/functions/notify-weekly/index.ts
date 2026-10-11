// Cron-driven (hourly): sends at most one "come play" push per week to each
// device, at the weekday+hour (UTC) that device plays most. Targets are picked
// server-side by get_weekly_reminder_targets (respects reminder preference,
// skips players active in the last 12 h, 6-day cooldown).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendPush, disableTokenIfStale } from "../_shared/apns.ts";

const TEXTS: Record<string, [string, string][]> = {
  sv: [["Dags för en runda Yatzy? 🎲", "Dina tärningar väntar – slå en Yatzy idag?"], ["Tärningarna längtar 🎲", "En snabb match? Det tar bara några minuter."]],
  en: [["Time for a round of Yatzy? 🎲", "Your dice are waiting – roll a Yatzy today?"], ["Your dice miss you 🎲", "Quick match? It only takes a few minutes."]],
  no: [["Tid for en runde Yatzy? 🎲", "Terningene dine venter – slå en Yatzy i dag?"]],
  da: [["Tid til en omgang Yatzy? 🎲", "Dine terninger venter – slå en Yatzy i dag?"]],
  fi: [["Aika Yatzy-kierrokselle? 🎲", "Noppasi odottavat – heitä Yatzy tänään?"]],
  de: [["Zeit für eine Runde Yatzy? 🎲", "Deine Würfel warten – heute ein Yatzy würfeln?"]],
  es: [["¿Una partida de Yatzy? 🎲", "Tus dados te esperan – ¿sacas un Yatzy hoy?"]],
  fr: [["Une partie de Yatzy ? 🎲", "Tes dés t'attendent – un Yatzy aujourd'hui ?"]],
  it: [["Una partita a Yatzy? 🎲", "I tuoi dadi ti aspettano – un Yatzy oggi?"]],
  nl: [["Tijd voor een potje Yatzy? 🎲", "Je dobbelstenen wachten – gooi vandaag een Yatzy?"]],
};

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

  const { data: targets, error } = await supabase.rpc("get_weekly_reminder_targets");
  if (error) return json({ error: error.message }, 500);

  let sent = 0;
  await Promise.all((targets ?? []).map(async (t: any) => {
    const lang = String(t.lang ?? "en").slice(0, 2).toLowerCase();
    const variants = TEXTS[lang] ?? TEXTS.en;
    const [title, body] = variants[Math.floor(Math.random() * variants.length)];
    const r = await sendPush({ platform: t.platform, deviceToken: t.token, title, body, data: { kind: "weekly" } });
    if (r.ok) sent++;
    else await disableTokenIfStale(supabase, t.token, r);
    await supabase.from("weekly_reminder_log").insert({ device_id: t.device_id, session_id: t.session_id, delivered: r.ok });
  }));

  console.log(`[notify-weekly] targets=${targets?.length ?? 0} sent=${sent}`);
  return json({ targets: targets?.length ?? 0, sent });
});
