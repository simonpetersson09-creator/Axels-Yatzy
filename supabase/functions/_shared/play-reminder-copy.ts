// Dependency-free push copy for the recurring play reminder, one entry per
// supported app language. English is the fallback. Keep keys in sync with the
// 40 languages in src/lib/i18n/translations/.

const COPY: Record<string, { title: string; body: string }> = {
  sv: { title: "Sugen på en omgång? 🎲", body: "Dags att kasta tärningarna i Mr B Yatzy." },
  en: { title: "Fancy a round? 🎲", body: "Time to roll the dice in Mr B Yatzy." },
  da: { title: "Lyst til en omgang? 🎲", body: "Tid til at kaste terningerne i Mr B Yatzy." },
  no: { title: "Lyst på en runde? 🎲", body: "På tide å kaste terningene i Mr B Yatzy." },
  fi: { title: "Tekisikö mieli pelata? 🎲", body: "On aika heittää noppia Mr B Yatzyssa." },
  de: { title: "Lust auf eine Runde? 🎲", body: "Zeit, die Würfel in Mr B Yatzy zu werfen." },
  nl: { title: "Zin in een potje? 🎲", body: "Tijd om de dobbelstenen te gooien in Mr B Yatzy." },
  fr: { title: "Envie d'une partie ? 🎲", body: "Il est temps de lancer les dés dans Mr B Yatzy." },
  es: { title: "¿Te apetece una partida? 🎲", body: "Es hora de tirar los dados en Mr B Yatzy." },
  ca: { title: "Et ve de gust una partida? 🎲", body: "És hora de llançar els daus a Mr B Yatzy." },
  it: { title: "Ti va una partita? 🎲", body: "È ora di lanciare i dadi in Mr B Yatzy." },
  pt: { title: "Queres uma partida? 🎲", body: "Hora de lançar os dados no Mr B Yatzy." },
  ptBR: { title: "Bora uma partida? 🎲", body: "Hora de rolar os dados no Mr B Yatzy." },
  pl: { title: "Masz ochotę na partię? 🎲", body: "Czas rzucić kośćmi w Mr B Yatzy." },
  cs: { title: "Chuť na partii? 🎲", body: "Je čas hodit kostkami v Mr B Yatzy." },
  sk: { title: "Chuť na partiu? 🎲", body: "Je čas hodiť kockami v Mr B Yatzy." },
  sl: { title: "Bi igral eno partijo? 🎲", body: "Čas je, da vržeš kocke v Mr B Yatzy." },
  hr: { title: "Zaigramo? 🎲", body: "Vrijeme je da baciš kockice u Mr B Yatzy." },
  hu: { title: "Egy parti? 🎲", body: "Ideje dobni a kockákkal a Mr B Yatzyban." },
  ro: { title: "O partidă? 🎲", body: "E timpul să arunci zarurile în Mr B Yatzy." },
  ru: { title: "Сыграем партию? 🎲", body: "Пора бросить кости в Mr B Yatzy." },
  uk: { title: "Зіграємо партію? 🎲", body: "Час кинути кістки в Mr B Yatzy." },
  el: { title: "Μια παρτίδα; 🎲", body: "Ώρα να ρίξεις τα ζάρια στο Mr B Yatzy." },
  tr: { title: "Bir el oynamaya ne dersin? 🎲", body: "Mr B Yatzy'de zarları atma zamanı." },
  ja: { title: "もう一局いかが？🎲", body: "Mr B Yatzyでサイコロを振る時間です。" },
  ko: { title: "한 판 어때요? 🎲", body: "Mr B Yatzy에서 주사위를 굴릴 시간이에요." },
  hi: { title: "एक राउंड खेलें? 🎲", body: "Mr B Yatzy में पासे फेंकने का समय है।" },
  bn: { title: "এক রাউন্ড খেলবেন? 🎲", body: "Mr B Yatzy-তে ছক্কা গড়ানোর সময়।" },
  ta: { title: "ஒரு சுற்று விளையாடலாமா? 🎲", body: "Mr B Yatzy-யில் பகடைகளை உருட்டும் நேரம்." },
  te: { title: "ఒక రౌండ్ ఆడతారా? 🎲", body: "Mr B Yatzyలో పాచికలు వేసే సమయం." },
  kn: { title: "ಒಂದು ಸುತ್ತು ಆಡೋಣವೇ? 🎲", body: "Mr B Yatzyಯಲ್ಲಿ ದಾಳಗಳನ್ನು ಹೊರಳುವ ಸಮಯ." },
  ml: { title: "ഒരു റൗണ്ട് കളിക്കാം? 🎲", body: "Mr B Yatzy-യിൽ ഡൈസ് ഉരുട്ടുന്ന സമയം." },
  mr: { title: "एक राउंड खेलाल का? 🎲", body: "Mr B Yatzy मध्ये फासे टाकण्याची वेळ." },
  gu: { title: "એક રાઉન્ડ રમશો? 🎲", body: "Mr B Yatzyમાં પાસા ફેંકવાનો સમય." },
  pa: { title: "ਇੱਕ ਰਾਉਂਡ ਖੇਡੋਗੇ? 🎲", body: "Mr B Yatzy ਵਿੱਚ ਪਾਸੇ ਸੁੱਟਣ ਦਾ ਸਮਾਂ।" },
  or: { title: "ଗୋଟିଏ ରାଉଣ୍ଡ ଖେଳିବେ? 🎲", body: "Mr B Yatzyରେ ଡାଇସ୍ ଗଡ଼ାଇବାର ସମୟ।" },
  id: { title: "Mau main satu ronde? 🎲", body: "Saatnya melempar dadu di Mr B Yatzy." },
  ms: { title: "Jom main sepusing? 🎲", body: "Masa untuk melambung dadu dalam Mr B Yatzy." },
  vi: { title: "Chơi một ván nhé? 🎲", body: "Đến lúc tung xúc xắc trong Mr B Yatzy." },
  th: { title: "เล่นสักตาไหม? 🎲", body: "ถึงเวลาทอยลูกเต๋าใน Mr B Yatzy แล้ว" },
};

/** Push title/body for the player's language; falls back to English. */
export function playReminderText(lang: string | null | undefined): { title: string; body: string } {
  const key = String(lang ?? "").trim();
  return COPY[key] ?? COPY[key.slice(0, 2)] ?? COPY.en;
}
