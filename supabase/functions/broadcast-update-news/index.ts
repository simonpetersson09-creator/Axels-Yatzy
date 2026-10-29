// One-time broadcast: a new app update is out. Per-device guard so it never sends twice.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendPush, disableTokenIfStale } from "../_shared/apns.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const GUARD = "broadcast:update_news_v3";

const TEXT: Record<string, [string, string]> = {
  sv: ["Mr.B Yatzy har uppdaterats 🎲", "Nya förbättringar väntar. Uppdatera och slå en Yatzy!"],
  en: ["Mr.B Yatzy has been updated 🎲", "New improvements are waiting. Update and roll a Yatzy!"],
  no: ["Mr.B Yatzy er oppdatert 🎲", "Nye forbedringer venter. Oppdater og slå en Yatzy!"],
  da: ["Mr.B Yatzy er opdateret 🎲", "Nye forbedringer venter. Opdater og slå en Yatzy!"],
  fi: ["Mr.B Yatzy on päivitetty 🎲", "Uudet parannukset odottavat. Päivitä ja heitä Yatzy!"],
  de: ["Mr.B Yatzy wurde aktualisiert 🎲", "Neue Verbesserungen warten. Aktualisiere und würfle ein Yatzy!"],
  nl: ["Mr.B Yatzy is bijgewerkt 🎲", "Nieuwe verbeteringen wachten. Update en gooi een Yatzy!"],
  fr: ["Mr.B Yatzy a été mis à jour 🎲", "De nouvelles améliorations vous attendent. Mettez à jour et faites un Yatzy !"],
  es: ["Mr.B Yatzy se ha actualizado 🎲", "Te esperan nuevas mejoras. ¡Actualiza y saca un Yatzy!"],
  it: ["Mr.B Yatzy è stato aggiornato 🎲", "Nuovi miglioramenti ti aspettano. Aggiorna e fai uno Yatzy!"],
  pl: ["Mr.B Yatzy został zaktualizowany 🎲", "Czekają nowe ulepszenia. Zaktualizuj i wyrzuć Yatzy!"],
  uk: ["Mr.B Yatzy оновлено 🎲", "На вас чекають нові покращення. Оновіть і викиньте Yatzy!"],
  ko: ["Mr.B Yatzy가 업데이트되었습니다 🎲", "새로운 개선 사항이 기다리고 있어요. 업데이트하고 Yatzy를 굴려보세요!"],
  ja: ["Mr.B Yatzyがアップデートされました 🎲", "新しい改善が待っています。アップデートしてYatzyを狙おう！"],
  ptBR: ["Mr.B Yatzy foi atualizado 🎲", "Novas melhorias esperam por você. Atualize e tire um Yatzy!"],
  pt: ["O Mr.B Yatzy foi atualizado 🎲", "Novas melhorias à tua espera. Atualiza e faz um Yatzy!"],
  ru: ["Mr.B Yatzy обновлён 🎲", "Вас ждут новые улучшения. Обновите и выбросите Yatzy!"],
  tr: ["Mr.B Yatzy güncellendi 🎲", "Yeni iyileştirmeler seni bekliyor. Güncelle ve bir Yatzy at!"],
  cs: ["Mr.B Yatzy byl aktualizován 🎲", "Čekají nová vylepšení. Aktualizujte a hoďte Yatzy!"],
  sk: ["Mr.B Yatzy bol aktualizovaný 🎲", "Čakajú nové vylepšenia. Aktualizujte a hoďte Yatzy!"],
  hu: ["Frissült a Mr.B Yatzy 🎲", "Új fejlesztések várnak. Frissíts és dobj egy Yatzyt!"],
  ro: ["Mr.B Yatzy a fost actualizat 🎲", "Te așteaptă îmbunătățiri noi. Actualizează și dă un Yatzy!"],
  hr: ["Mr.B Yatzy je ažuriran 🎲", "Čekaju nova poboljšanja. Ažuriraj i baci Yatzy!"],
  sl: ["Mr.B Yatzy je posodobljen 🎲", "Čakajo nove izboljšave. Posodobi in vrzi Yatzy!"],
  el: ["Το Mr.B Yatzy ενημερώθηκε 🎲", "Νέες βελτιώσεις σας περιμένουν. Ενημερώστε και ρίξτε ένα Yatzy!"],
  ca: ["Mr.B Yatzy s"ha actualitzat 🎲", "T"esperen noves millores. Actualitza i treu un Yatzy!"],
  id: ["Mr.B Yatzy telah diperbarui 🎲", "Peningkatan baru menanti. Perbarui dan lempar Yatzy!"],
  ms: ["Mr.B Yatzy telah dikemas kini 🎲", "Penambahbaikan baharu menanti. Kemas kini dan baling Yatzy!"],
  vi: ["Mr.B Yatzy đã được cập nhật 🎲", "Những cải tiến mới đang chờ. Cập nhật và đổ một Yatzy!"],
  th: ["Mr.B Yatzy อัปเดตแล้ว 🎲", "มีการปรับปรุงใหม่รออยู่ อัปเดตแล้วทอยให้ได้ Yatzy!"],
  hi: ["Mr.B Yatzy अपडेट हो गया 🎲", "नए सुधार आपका इंतज़ार कर रहे हैं। अपडेट करें और Yatzy फेंकें!"],
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
    supabase.from("push_tokens").select("device_id, session_id, token, platform").eq("enabled", true).order("updated_at", { ascending: false }).range(0, 9999),
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
