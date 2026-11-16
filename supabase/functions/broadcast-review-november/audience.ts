export const CAMPAIGN = 'play_20261101';
export function deliveryEvent(deviceId: string, platform: string, accepted: boolean) {
  return {event_name:'broadcast_notification_sent',device_id:deviceId,platform:'server',metadata:{campaign:CAMPAIGN,accepted,recipient_platform:platform}};
}
export interface Target { device_id: string; token: string; platform: string; enabled: boolean }
export interface Preference { device_id: string; play_reminders: boolean; lang: string | null }
export function recipients(tokens: Target[], prefs: Preference[]) {
  const preferences = new Map(prefs.map(p => [p.device_id, p]));
  const seen = new Set<string>();
  return tokens.filter(t => {
    if (seen.has(t.device_id)) return false;
    seen.add(t.device_id);
    return t.enabled && ['ios', 'android'].includes(t.platform) && preferences.get(t.device_id)?.play_reminders === true;
  }).map(t => ({ ...t, lang: preferences.get(t.device_id)?.lang }));
}
const COPY: Record<string, [string, string]> = {
  sv: ['Dags för en Yatzy? 🎲', 'Tärningarna väntar! Spela en match och utmana ditt bästa resultat i Mr.B. Yatzy.'],
  en: ['Time for a Yatzy? 🎲', 'The dice are waiting! Play a game and challenge your best score in Mr.B. Yatzy.'],
  da: ['Tid til en Yatzy? 🎲', 'Terningerne venter! Spil en omgang og udfordr din bedste score i Mr.B. Yatzy.'],
  no: ['Tid for en Yatzy? 🎲', 'Terningene venter! Spill en runde og utfordre din beste poengsum i Mr.B. Yatzy.'],
  fi: ['Yatzyn aika? 🎲', 'Nopat odottavat! Pelaa peli ja haasta paras tuloksesi Mr.B. Yatzyssa.'],
  de: ['Zeit für Yatzy? 🎲', 'Die Würfel warten! Spiele eine Runde und fordere deinen Rekord in Mr.B. Yatzy heraus.'],
  nl: ['Tijd voor Yatzy? 🎲', 'De dobbelstenen wachten! Speel een potje en verbeter je beste score in Mr.B. Yatzy.'],
  fr: ['Une partie de Yatzy ? 🎲', 'Les dés vous attendent ! Jouez une partie et défiez votre meilleur score dans Mr.B. Yatzy.'],
  es: ['¿Una partida de Yatzy? 🎲', '¡Los dados te esperan! Juega una partida y supera tu mejor puntuación en Mr.B. Yatzy.'],
  ca: ['Una partida de Yatzy? 🎲', 'Els daus t’esperen! Juga una partida i supera la teva millor puntuació a Mr.B. Yatzy.'],
  it: ['Una partita a Yatzy? 🎲', 'I dadi ti aspettano! Gioca una partita e sfida il tuo record in Mr.B. Yatzy.'],
  pt: ['Uma partida de Yatzy? 🎲', 'Os dados esperam por ti! Joga uma partida e desafia a tua melhor pontuação no Mr.B. Yatzy.'],
  ptBR: ['Bora jogar Yatzy? 🎲', 'Os dados estão esperando! Jogue uma partida e desafie sua melhor pontuação no Mr.B. Yatzy.'],
  pl: ['Czas na Yatzy? 🎲', 'Kości czekają! Zagraj partię i pobij swój najlepszy wynik w Mr.B. Yatzy.'],
  cs: ['Čas na Yatzy? 🎲', 'Kostky čekají! Zahraj si a překonej svůj nejlepší výsledek v Mr.B. Yatzy.'],
  sk: ['Čas na Yatzy? 🎲', 'Kocky čakajú! Zahraj si a prekonaj svoj najlepší výsledok v Mr.B. Yatzy.'],
  sl: ['Čas za Yatzy? 🎲', 'Kocke čakajo! Odigraj igro in izboljšaj svoj najboljši rezultat v Mr.B. Yatzy.'],
  hr: ['Vrijeme za Yatzy? 🎲', 'Kockice čekaju! Odigraj partiju i nadmaši svoj najbolji rezultat u Mr.B. Yatzy.'],
  hu: ['Jöhet egy Yatzy? 🎲', 'A kockák várnak! Játssz egy partit, és döntsd meg a rekordodat a Mr.B. Yatzyban.'],
  ro: ['O partidă de Yatzy? 🎲', 'Zarurile te așteaptă! Joacă o partidă și depășește-ți cel mai bun scor în Mr.B. Yatzy.'],
  ru: ['Пора сыграть в Yatzy? 🎲', 'Кубики ждут! Сыграй партию и побей свой рекорд в Mr.B. Yatzy.'],
  uk: ['Час зіграти в Yatzy? 🎲', 'Кубики чекають! Зіграй партію та переверш свій найкращий результат у Mr.B. Yatzy.'],
  el: ['Ώρα για Yatzy; 🎲', 'Τα ζάρια περιμένουν! Παίξε μια παρτίδα και ξεπέρασε το ρεκόρ σου στο Mr.B. Yatzy.'],
  tr: ['Yatzy zamanı mı? 🎲', 'Zarlar seni bekliyor! Bir oyun oyna ve Mr.B. Yatzy’de en iyi puanını aş.'],
  ja: ['Yatzyを遊びませんか？🎲', 'サイコロが待っています！Mr.B. Yatzyで一局遊んで、自己ベストに挑戦しましょう。'],
  ko: ['Yatzy 한 판 어때요? 🎲', '주사위가 기다려요! Mr.B. Yatzy에서 한 판 즐기고 최고 기록에 도전하세요.'],
  hi: ['Yatzy खेलने का समय? 🎲', 'पासे इंतज़ार कर रहे हैं! Mr.B. Yatzy में एक गेम खेलें और अपने सर्वश्रेष्ठ स्कोर को चुनौती दें।'],
  bn: ['Yatzy খেলবেন? 🎲', 'ছক্কা অপেক্ষা করছে! Mr.B. Yatzy-তে একটি গেম খেলুন এবং নিজের সেরা স্কোরকে চ্যালেঞ্জ করুন।'],
  ta: ['Yatzy விளையாடலாமா? 🎲', 'பகடைகள் காத்திருக்கின்றன! Mr.B. Yatzy-யில் விளையாடி உங்கள் சிறந்த மதிப்பெண்ணைச் சவால் செய்யுங்கள்.'],
  te: ['Yatzy ఆడదామా? 🎲', 'పాచికలు ఎదురుచూస్తున్నాయి! Mr.B. Yatzyలో ఆడి మీ అత్యుత్తమ స్కోర్‌ను సవాలు చేయండి.'],
  kn: ['Yatzy ಆಡೋಣವೇ? 🎲', 'ದಾಳಗಳು ಕಾಯುತ್ತಿವೆ! Mr.B. Yatzyಯಲ್ಲಿ ಆಡಿ ನಿಮ್ಮ ಅತ್ಯುತ್ತಮ ಅಂಕಗಳಿಗೆ ಸವಾಲು ಹಾಕಿ.'],
  ml: ['Yatzy കളിക്കാം? 🎲', 'ഡൈസ് കാത്തിരിക്കുന്നു! Mr.B. Yatzyയിൽ കളിച്ച് നിങ്ങളുടെ മികച്ച സ്കോറിനെ വെല്ലുവിളിക്കൂ.'],
  mr: ['Yatzy खेळायचा? 🎲', 'फासे वाट पाहत आहेत! Mr.B. Yatzy मध्ये खेळा आणि तुमच्या सर्वोत्तम गुणांना आव्हान द्या.'],
  gu: ['Yatzy રમશો? 🎲', 'પાસા રાહ જોઈ રહ્યા છે! Mr.B. Yatzyમાં રમો અને તમારા શ્રેષ્ઠ સ્કોરને પડકારો.'],
  pa: ['Yatzy ਖੇਡੀਏ? 🎲', 'ਪਾਸੇ ਉਡੀਕ ਰਹੇ ਹਨ! Mr.B. Yatzy ਵਿੱਚ ਖੇਡੋ ਅਤੇ ਆਪਣੇ ਸਭ ਤੋਂ ਵਧੀਆ ਸਕੋਰ ਨੂੰ ਚੁਣੌਤੀ ਦਿਓ।'],
  or: ['Yatzy ଖେଳିବେ? 🎲', 'ଡାଇସ୍ ଅପେକ୍ଷା କରିଛି! Mr.B. Yatzyରେ ଖେଳନ୍ତୁ ଏବଂ ନିଜର ସର୍ବଶ୍ରେଷ୍ଠ ସ୍କୋରକୁ ଚ୍ୟାଲେଞ୍ଜ କରନ୍ତୁ।'],
  id: ['Saatnya main Yatzy? 🎲', 'Dadu menunggu! Mainkan satu ronde dan tantang skor terbaikmu di Mr.B. Yatzy.'],
  ms: ['Masa untuk Yatzy? 🎲', 'Dadu menanti! Main satu pusingan dan cabar skor terbaik anda dalam Mr.B. Yatzy.'],
  vi: ['Chơi Yatzy nhé? 🎲', 'Xúc xắc đang chờ! Chơi một ván và thử vượt điểm cao nhất của bạn trong Mr.B. Yatzy.'],
  th: ['ได้เวลาเล่น Yatzy ไหม? 🎲', 'ลูกเต๋ารออยู่! เล่นสักตาและท้าทายคะแนนสูงสุดของคุณใน Mr.B. Yatzy'],
};
export function campaignText(lang: string | null | undefined) {
  const key = (lang ?? '').trim();
  const [title, body] = COPY[key] ?? COPY[key.slice(0, 2)] ?? COPY.en;
  return { title, body };
}