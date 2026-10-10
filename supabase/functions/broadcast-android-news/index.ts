// One-time broadcast: tells every player with push enabled that the app is now
// on Google Play. Guarded by a rate_limits row so it can only ever run once.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendPush, disableTokenIfStale } from "../_shared/apns.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const GUARD = "broadcast:android_news_v1";

const TEXT: Record<string, [string, string]> = {
  sv: ["Mr.B. Yatzy finns nu för Android 🎉", "Har du vänner med Android? Nu kan de ladda ner appen på Google Play och spela med dig."],
  en: ["Mr.B. Yatzy is now on Android 🎉", "Got friends with Android? They can now download the app on Google Play and play with you."],
  no: ["Mr.B. Yatzy finnes nå for Android 🎉", "Har du venner med Android? Nå kan de laste ned appen på Google Play og spille med deg."],
  da: ["Mr.B. Yatzy findes nu til Android 🎉", "Har du venner med Android? Nu kan de hente appen på Google Play og spille med dig."],
  fi: ["Mr.B. Yatzy on nyt Androidilla 🎉", "Onko ystävilläsi Android? Nyt he voivat ladata sovelluksen Google Playsta ja pelata kanssasi."],
  de: ["Mr.B. Yatzy gibt es jetzt für Android 🎉", "Freunde mit Android? Sie können die App jetzt bei Google Play laden und mit dir spielen."],
  es: ["Mr.B. Yatzy ya está en Android 🎉", "¿Amigos con Android? Ya pueden descargar la app en Google Play y jugar contigo."],
  fr: ["Mr.B. Yatzy est maintenant sur Android 🎉", "Des amis sur Android ? Ils peuvent télécharger l'appli sur Google Play et jouer avec toi."],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (b: object, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: tokens } = await supabase.from("push_tokens").select("device_id, token, platform").eq("enabled", true);
  const { data: prefs } = await supabase.from("notification_preferences").select("device_id, lang");
  const lang = new Map((prefs ?? []).map((p) => [p.device_id, p.lang as string | null]));

  let sent = 0, failed = 0;
  const reasons: Record<string, number> = {};
  for (const t of tokens ?? []) {
    if (t.platform === "android") continue; // Android players already have it
    // Per-device guard: re-running the function never sends twice to anyone.
    const key = `${GUARD}:${t.device_id}`;
    const { data: claimed } = await supabase
      .from("rate_limits").upsert({ key }, { onConflict: "key", ignoreDuplicates: true }).select("key");
    if (!claimed || claimed.length === 0) continue;
    const [title, body] = TEXT[lang.get(t.device_id) ?? "sv"] ?? TEXT.en;
    const r = await sendPush({ deviceToken: t.token, platform: t.platform, title, body, data: { kind: "news" } });
    if (r.ok) sent++;
    else {
      if (r.status === 429) {
        // Apple throttled us: release this device and stop; run again later.
        await supabase.from("rate_limits").delete().eq("key", key);
        reasons[r.reason ?? "429"] = (reasons[r.reason ?? "429"] ?? 0) + 1;
        break;
      }
      failed++;
      reasons[r.reason ?? "unknown"] = (reasons[r.reason ?? "unknown"] ?? 0) + 1;
      await disableTokenIfStale(supabase, t.token, r);
    }
  }
  console.log("[broadcast-android-news]", { sent, failed, reasons });
  return json({ sent, failed, reasons });
});
