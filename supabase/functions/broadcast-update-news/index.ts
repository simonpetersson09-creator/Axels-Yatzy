// One-time broadcast: a new app update is out. Per-device guard so it never sends twice.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendPush, disableTokenIfStale } from "../_shared/apns.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const GUARD = "broadcast:update_news_v1";

const TEXT: Record<string, [string, string]> = {
  sv: ["Uppdatera Mr.B Yatzy 🎲", "Den nya versionen är här. Nya tärningar och mycket mer!"],
  en: ["Update Mr.B Yatzy 🎲", "The new version is here. New dice and much more!"],
  no: ["Oppdater Mr.B Yatzy 🎲", "Den nye versjonen er her. Nye terninger og mye mer!"],
  da: ["Opdater Mr.B Yatzy 🎲", "Den nye version er her. Nye terninger og meget mere!"],
  fi: ["Päivitä Mr.B Yatzy 🎲", "Uusi versio on täällä. Uusia noppia ja paljon muuta!"],
  de: ["Aktualisiere Mr.B Yatzy 🎲", "Die neue Version ist da. Neue Würfel und vieles mehr!"],
  nl: ["Update Mr.B Yatzy 🎲", "De nieuwe versie is er. Nieuwe dobbelstenen en nog veel meer!"],
  fr: ["Mets à jour Mr.B Yatzy 🎲", "La nouvelle version est là. De nouveaux dés et bien plus encore !"],
  es: ["Actualiza Mr.B Yatzy 🎲", "¡La nueva versión ya está aquí. Nuevos dados y mucho más!"],
  it: ["Aggiorna Mr.B Yatzy 🎲", "La nuova versione è qui. Nuovi dadi e molto altro!"],
  pl: ["Zaktualizuj Mr.B Yatzy 🎲", "Nowa wersja już jest. Nowe kości i wiele więcej!"],
  uk: ["Оновіть Mr.B Yatzy 🎲", "Нова версія вже тут. Нові кубики та багато іншого!"],
  ko: ["Mr.B Yatzy를 업데이트하세요 🎲", "새 버전이 나왔어요. 새로운 주사위와 더 많은 것들!"],
  ja: ["Mr.B Yatzyをアップデート 🎲", "新しいバージョンが登場。新しいサイコロなど盛りだくさん!"],
};

const COUNTRY_LANG: Record<string, string> = {
  SE: "sv", NO: "no", DK: "da", FI: "fi", DE: "de", AT: "de", CH: "de", NL: "nl", BE: "nl",
  FR: "fr", ES: "es", MX: "es", AR: "es", IT: "it", PL: "pl", UA: "uk", KR: "ko", JP: "ja",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (b: object, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const [{ data: tokens }, { data: prefs }, { data: countries }] = await Promise.all([
    // Newest token first so a device with an old leftover token gets the current one.
    supabase.from("push_tokens").select("device_id, session_id, token, platform").eq("enabled", true).order("updated_at", { ascending: false }),
    // Big tables: read all rows (default select stops at 1000, which dropped languages).
    supabase.from("notification_preferences").select("device_id, lang").not("lang", "is", null).range(0, 9999),
    supabase.from("player_country_stats").select("session_id, country").range(0, 9999),
  ]);
  const lang = new Map((prefs ?? []).map((p) => [p.device_id, p.lang as string | null]));
  const country = new Map((countries ?? []).map((c) => [c.session_id, String(c.country).toUpperCase()]));

  let sent = 0, failed = 0;
  const reasons: Record<string, number> = {};
  const langs: Record<string, number> = {};
  for (const t of tokens ?? []) {
    const key = `${GUARD}:${t.device_id}`;
    const { data: claimed } = await supabase
      .from("rate_limits").upsert({ key }, { onConflict: "key", ignoreDuplicates: true }).select("key");
    if (!claimed || claimed.length === 0) continue;
    const l = lang.get(t.device_id) ?? (t.session_id ? COUNTRY_LANG[country.get(t.session_id) ?? ""] : undefined) ?? "en";
    const [title, body] = TEXT[l] ?? TEXT.en;
    const r = await sendPush({ deviceToken: t.token, platform: t.platform, title, body, data: { kind: "news" } });
    if (r.ok) { sent++; langs[TEXT[l] ? l : "en"] = (langs[TEXT[l] ? l : "en"] ?? 0) + 1; }
    else {
      if (r.status === 429) {
        await supabase.from("rate_limits").delete().eq("key", key);
        reasons[r.reason ?? "429"] = (reasons[r.reason ?? "429"] ?? 0) + 1;
        break;
      }
      failed++;
      reasons[r.reason ?? "unknown"] = (reasons[r.reason ?? "unknown"] ?? 0) + 1;
      await disableTokenIfStale(supabase, t.token, r);
    }
  }
  console.log("[broadcast-update-news]", { sent, failed, reasons, langs });
  return json({ sent, failed, reasons, langs });
});
