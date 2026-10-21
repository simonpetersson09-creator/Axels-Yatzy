// One-time broadcast: a new app update is out. Per-device guard so it never sends twice.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendPush, disableTokenIfStale } from "../_shared/apns.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const GUARD = "broadcast:update_news_v1";

const TEXT: Record<string, [string, string]> = {
  sv: ["Nytt i Mr.B Yatzy 🎲", "Tjäna XP på frivilliga annonser och köp fina tärningar."],
  en: ["New in Mr.B Yatzy 🎲", "Earn XP by watching optional ads and buy beautiful dice."],
  no: ["Nytt i Mr.B Yatzy 🎲", "Tjen XP ved å se frivillige annonser og kjøp flotte terninger."],
  da: ["Nyt i Mr.B Yatzy 🎲", "Optjen XP ved at se frivillige annoncer og køb flotte terninger."],
  fi: ["Uutta Mr.B Yatzyssa 🎲", "Ansaitse XP:tä katsomalla vapaaehtoisia mainoksia ja osta upeita noppia."],
  de: ["Neu in Mr.B Yatzy 🎲", "Verdiene XP durch freiwillige Werbevideos und kaufe schöne Würfel."],
  nl: ["Nieuw in Mr.B Yatzy 🎲", "Verdien XP door vrijwillig advertenties te bekijken en koop mooie dobbelstenen."],
  fr: ["Du nouveau dans Mr.B Yatzy 🎲", "Gagnez des XP en regardant des publicités facultatives et achetez de beaux dés."],
  es: ["Novedades en Mr.B Yatzy 🎲", "Gana XP viendo anuncios opcionales y compra dados bonitos."],
  it: ["Novità in Mr.B Yatzy 🎲", "Guadagna XP guardando annunci facoltativi e acquista bellissimi dadi."],
  pl: ["Nowości w Mr.B Yatzy 🎲", "Zdobywaj XP za oglądanie dobrowolnych reklam i kupuj piękne kości."],
  uk: ["Новинки в Mr.B Yatzy 🎲", "Отримуйте XP за добровільний перегляд реклами та купуйте гарні кубики."],
  ko: ["Mr.B Yatzy의 새로운 소식 🎲", "원할 때 광고를 보고 XP를 모아 예쁜 주사위를 구매하세요."],
  ja: ["Mr.B Yatzyの新機能 🎲", "任意の広告視聴でXPを獲得して、素敵なサイコロを購入しましょう。"],
  bn: ["Mr.B Yatzy-তে নতুন 🎲", "ইচ্ছেমতো বিজ্ঞাপন দেখে XP অর্জন করুন এবং সুন্দর পাশা কিনুন।"],
  ca: ["Novetats a Mr.B Yatzy 🎲", "Guanya XP mirant anuncis opcionals i compra daus bonics."],
  cs: ["Novinky v Mr.B Yatzy 🎲", "Získejte XP sledováním dobrovolných reklam a kupte si krásné kostky."],
  el: ["Νέα στο Mr.B Yatzy 🎲", "Κερδίστε XP βλέποντας προαιρετικές διαφημίσεις και αγοράστε όμορφα ζάρια."],
  gu: ["Mr.B Yatzyમાં નવું 🎲", "તમારી ઇચ્છાથી જાહેરાતો જોઈને XP મેળવો અને સુંદર પાસા ખરીદો."],
  hi: ["Mr.B Yatzy में नया 🎲", "अपनी इच्छा से विज्ञापन देखकर XP कमाएँ और सुंदर पासे खरीदें।"],
  hr: ["Novo u Mr.B Yatzy 🎲", "Zaradite XP gledanjem dobrovoljnih oglasa i kupite lijepe kockice."],
  hu: ["Újdonságok a Mr.B Yatzyban 🎲", "Szerezz XP-t önkéntes reklámnézéssel, és vásárolj szép dobókockákat."],
  id: ["Baru di Mr.B Yatzy 🎲", "Dapatkan XP dengan menonton iklan opsional dan beli dadu cantik."],
  kn: ["Mr.B Yatzyಯಲ್ಲಿ ಹೊಸದು 🎲", "ನಿಮ್ಮ ಇಚ್ಛೆಯಂತೆ ಜಾಹೀರಾತುಗಳನ್ನು ನೋಡಿ XP ಗಳಿಸಿ ಮತ್ತು ಸುಂದರ ದಾಳಗಳನ್ನು ಖರೀದಿಸಿ."],
  ml: ["Mr.B Yatzyയിൽ പുതിയത് 🎲", "നിങ്ങളുടെ ഇഷ്ടപ്രകാരം പരസ്യങ്ങൾ കണ്ട് XP നേടൂ, മനോഹരമായ പകിടകൾ വാങ്ങൂ."],
  mr: ["Mr.B Yatzy मध्ये नवीन 🎲", "तुमच्या इच्छेने जाहिराती पाहून XP मिळवा आणि सुंदर फासे खरेदी करा."],
  ms: ["Baharu dalam Mr.B Yatzy 🎲", "Dapatkan XP dengan menonton iklan pilihan dan beli dadu yang cantik."],
  or: ["Mr.B Yatzyରେ ନୂଆ 🎲", "ନିଜ ଇଚ୍ଛାରେ ବିଜ୍ଞାପନ ଦେଖି XP ଅର୍ଜନ କରନ୍ତୁ ଏବଂ ସୁନ୍ଦର ପଶା କିଣନ୍ତୁ।"],
  pa: ["Mr.B Yatzy ਵਿੱਚ ਨਵਾਂ 🎲", "ਆਪਣੀ ਮਰਜ਼ੀ ਨਾਲ ਇਸ਼ਤਿਹਾਰ ਦੇਖ ਕੇ XP ਕਮਾਓ ਅਤੇ ਸੁੰਦਰ ਪਾਸੇ ਖਰੀਦੋ।"],
  ptBR: ["Novidades no Mr.B Yatzy 🎲", "Ganhe XP assistindo a anúncios opcionais e compre dados bonitos."],
  pt: ["Novidades no Mr.B Yatzy 🎲", "Ganha XP ao veres anúncios opcionais e compra dados bonitos."],
  ro: ["Noutăți în Mr.B Yatzy 🎲", "Câștigă XP urmărind reclame opționale și cumpără zaruri frumoase."],
  ru: ["Новое в Mr.B Yatzy 🎲", "Получайте XP за добровольный просмотр рекламы и покупайте красивые кубики."],
  sk: ["Novinky v Mr.B Yatzy 🎲", "Získajte XP sledovaním dobrovoľných reklám a kúpte si krásne kocky."],
  sl: ["Novosti v Mr.B Yatzy 🎲", "Z ogledom neobveznih oglasov zaslužite XP in kupite lepe kocke."],
  ta: ["Mr.B Yatzy-யில் புதிது 🎲", "விருப்பப்படி விளம்பரங்களைப் பார்த்து XP பெற்று அழகான பகடைகளை வாங்குங்கள்."],
  te: ["Mr.B Yatzyలో కొత్తవి 🎲", "మీ ఇష్టంతో ప్రకటనలు చూసి XP సంపాదించండి, అందమైన పాచికలను కొనండి."],
  th: ["ใหม่ใน Mr.B Yatzy 🎲", "รับ XP จากการเลือกดูโฆษณาและซื้อเต๋าสวย ๆ"],
  tr: ["Mr.B Yatzy'de yenilikler 🎲", "İsteğe bağlı reklamları izleyerek XP kazanın ve güzel zarlar satın alın."],
  vi: ["Mới trong Mr.B Yatzy 🎲", "Kiếm XP bằng cách tự nguyện xem quảng cáo và mua xúc xắc đẹp."],
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
