// One-time broadcast: a new app update is out. Per-device guard so it never sends twice.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendPush, disableTokenIfStale } from "../_shared/apns.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const GUARD = "broadcast:update_news_v2";

const TEXT: Record<string, [string, string]> = {
  sv: ["Nytt i Mr.B Yatzy 🎲", "Tjäna XP på frivilliga annonser och köp fina tärningar och andra effekter."],
  en: ["New in Mr.B Yatzy 🎲", "Earn XP on voluntary ads and buy beautiful dice and other effects."],
  no: ["Nytt i Mr.B Yatzy 🎲", "Tjen XP på frivillige annonser og kjøp flotte terninger og andre effekter."],
  da: ["Nyt i Mr.B Yatzy 🎲", "Tjen XP på frivillige annoncer og køb flotte terninger og andre effekter."],
  fi: ["Uutta Mr.B Yatzyssa 🎲", "Ansaitse XP:tä vapaaehtoisista mainoksista ja osta upeat nopat ja muut tehosteet."],
  de: ["Neu in Mr.B Yatzy 🎲", "Verdiene XP mit freiwilligen Anzeigen und kaufe schöne Würfel und andere Effekte."],
  nl: ["Nieuw in Mr.B Yatzy 🎲", "Verdien XP met vrijwillige advertenties en koop mooie dobbelstenen en andere effecten."],
  fr: ["Du nouveau dans Mr.B Yatzy 🎲", "Gagnez des XP grâce aux annonces volontaires et achetez de beaux dés et d'autres effets."],
  es: ["Novedades en Mr.B Yatzy 🎲", "Gana XP con anuncios voluntarios y compra dados bonitos y otros efectos."],
  it: ["Novità in Mr.B Yatzy 🎲", "Guadagna XP con annunci volontari e acquista bellissimi dadi e altri effetti."],
  pl: ["Nowości w Mr.B Yatzy 🎲", "Zdobywaj XP za dobrowolne reklamy i kup piękne kości i inne efekty."],
  uk: ["Новинки в Mr.B Yatzy 🎲", "Заробляйте XP за добровільну рекламу та купуйте гарні кубики та інші ефекти."],
  ko: ["Mr.B Yatzy의 새로운 소식 🎲", "자발적 광고 시청으로 XP를 얻고 예쁜 주사위와 다양한 효과를 구매하세요."],
  ja: ["Mr.B Yatzyの新機能 🎲", "任意の広告を視聴してXPを獲得し、素敵なサイコロやその他のエフェクトを購入しましょう。"],
  bn: ["Mr.B Yatzy-ত নতুন 🎲", "স্বেচ্ছামূলক বিজ্ঞাপন দেখে XP অর্জন করুন এবং সুন্দর পাশা ও অন্যান্য ইফেক্ট কিনুন।"],
  ca: ["Novetats a Mr.B Yatzy 🎲", "Guanya XP amb anuncis voluntaris i compra daus bonics i altres efectes."],
  cs: ["Novinky v Mr.B Yatzy 🎲", "Získejte XP za dobrovolné reklamy a kupte si krásné kostky a další efekty."],
  el: ["Νέα στο Mr.B Yatzy 🎲", "Κερδίστε XP με εθελοντικές διαφημίσεις και αγοράστε όμορφα ζάρια και άλλα εφέ."],
  gu: ["Mr.B Yatzyમાં નવું 🎲", "સ્વૈચ્છિક જાહેરાતો જોઈને XP મેળવો અને સુંદર પાસા અને અન્ય ઇફેક્ટ્સ ખરીદો."],
  hi: ["Mr.B Yatzy में नया 🎲", "सुंदर पासे और अन्य इफ़ेक्ट खरीदें।"],
  hr: ["Novo u Mr.B Yatzy 🎲", "Kupite lijepe kockice i druge efekte."],
  hu: ["Újdonságok a Mr.B Yatzyban 🎲", "Vásárolj szép dobókockákat és egyéb effekteteket."],
  id: ["Baru di Mr.B Yatzy 🎲", "Beli dadu cantik dan efek lainnya."],
  kn: ["Mr.B Yatzyಯಲ್ಲಿ ಹೊಸದು 🎲", "ಸುಂದರ ದಾಳಗಳನ್ನು ಮತ್ತು ಇತರ ಎಫೆಕ್ಟ್‌ಗಳನ್ನು ಖರೀದಿಸಿ."],
  ml: ["Mr.B Yatzyയിൽ പുതിയത് 🎲", "മനോഹരമായ പകിടകളും മറ്റു ഇഫക്ടുകളും വാങ്ങൂ."],
  mr: ["Mr.B Yatzy मध्ये नवीन 🎲", "सुंदर फासे आणि इतर इफेक्ट्स खरेदी करा."],
  ms: ["Baharu dalam Mr.B Yatzy 🎲", "Beli dadu yang cantik dan efek-efek lain."],
  or: ["Mr.B Yatzyର ନୂଆ 🎲", "ସୁନଦର ପଶ ଏବଂ ଅନ୍ୟ ଇଫେକ୍ଟ କିଣନ୍ତୁ।"],
  pa: ["Mr.B Yatzy ਵਿੱਚ ਨਵਾਂ 🎲", "ਸੁੰਦਰ ਪਾਸੇ ਅਤੇ ਹੋਰ ਇਫੈਕਟ ਖਰੀਦੋ।"],
  ptBR: ["Novidades no Mr.B Yatzy 🎲", "Ganhe XP assistindo a anúncios voluntários e compre dados bonitos e outros efeitos."],
  pt: ["Novidades no Mr.B Yatzy 🎲", "Ganha XP ao ver anúncios voluntários e compra dados bonitos e outros efeitos."],
  ro: ["Noutăți în Mr.B Yatzy 🎲", "Câștigă XP vizionând reclame voluntare și cumpără zaruri frumoase și alte efecte."],
  ru: ["Новое в Mr.B Yatzy 🎲", "Зарабатывайте XP за просмотр добровольной рекламы и покупайте красивые кубики и другие эффекты."],
  sk: ["Novinky v Mr.B Yatzy 🎲", "Získajte XP za dobrovoľné reklamy a kúpte si krásne kocky a iné efekty."],
  sl: ["Novosti v Mr.B Yatzy 🎲", "Zaslužite XP z ogledom prostovoljnih oglasov in kupite lepe kocke in druge učinke."],
  ta: ["Mr.B Yatzy-யில புதிது 🎲", "தன்னார்வ விளம்பரங்களைப் பார்த்து XP பெற்று அழகான பகைகளையும் மற்ற விளைவுகளையும் வாங்குங்கள்."],
  te: ["Mr.B Yatzyలో కొత్తది 🎲", "స్వచ్ఛంద ప్రకటనలు చూసి XP సంపాదించండి మరియు అందమైన పాచికలను, ఇతర ఎఫెక్ట్‌లను కొనండి."],
  th: ["ใหมใน Mr.B Yatzy 🎲", "รับ XP จากการดูโฆษณาแบบสมัครใจ และซื้อเต๋าสวย ๆ และเอฟเฟกต์อื่น ๆ"],
  tr: ["Mr.B Yatzy'de yenilikler 🎲", "Gönüllü reklamları izleyerek XP kazanın ve güzel zarlar ve diğer efektleri satın alın."],
  vi: ["Mới trong Mr.B Yatzy 🎲", "Kiếm XP bằng cách xem quảng cáo tự nguyện và mua xúc xắc đẹp và các hiệu ứng khác."],
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
