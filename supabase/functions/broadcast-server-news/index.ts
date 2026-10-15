// One-time broadcast: server upgraded + apology for recent problems.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendPush, disableTokenIfStale } from "../_shared/apns.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const GUARD = "broadcast:server_news_v1";

const TEXT: Record<string, [string, string]> = {
  sv: ["Mr.B. Yatzy är snabbare nu 🎲", "Förlåt för strulet de senaste dagarna. Vi har uppgraderat servern och förbättrat spelet. Tack för att du spelar!"],
  en: ["Mr.B. Yatzy is faster now 🎲", "Sorry for the trouble the last few days. We've upgraded the server and improved the game. Thanks for playing!"],
  no: ["Mr.B. Yatzy er raskere nå 🎲", "Beklager trøbbelet de siste dagene. Vi har oppgradert serveren og forbedret spillet. Takk for at du spiller!"],
  da: ["Mr.B. Yatzy er hurtigere nu 🎲", "Undskyld for bøvlet de seneste dage. Vi har opgraderet serveren og forbedret spillet. Tak fordi du spiller!"],
  fi: ["Mr.B. Yatzy on nyt nopeampi 🎲", "Pahoittelut viime päivien ongelmista. Päivitimme palvelimen ja paransimme peliä. Kiitos että pelaat!"],
  de: ["Mr.B. Yatzy ist jetzt schneller 🎲", "Entschuldige die Probleme der letzten Tage. Wir haben den Server aufgerüstet und das Spiel verbessert. Danke fürs Spielen!"],
  es: ["Mr.B. Yatzy ahora es más rápido 🎲", "Perdón por los problemas de los últimos días. Hemos mejorado el servidor y el juego. ¡Gracias por jugar!"],
  fr: ["Mr.B. Yatzy est plus rapide 🎲", "Désolé pour les soucis de ces derniers jours. Nous avons amélioré le serveur et le jeu. Merci de jouer !"],
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
  console.log("[broadcast-server-news]", { sent, failed, reasons });
  return json({ sent, failed, reasons });
});
