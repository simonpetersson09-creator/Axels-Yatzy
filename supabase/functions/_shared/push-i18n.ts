// Push texts in the recipient's app language. {name} = opponent name.
// turnTitle / turnBody = "Din tur", remTitle / remBody = reminder.
type T = [string, string, string, string];
const P: Record<string, T> = {
  sv: ["{name} väntar 🎲", "Det är din tur i Yatzy-matchen", "Din match väntar 👀", "{name} väntar på ditt drag"],
  en: ["{name} is waiting 🎲", "It's your turn in the Yatzy match", "Your match is waiting 👀", "{name} is waiting for your move"],
  no: ["{name} venter 🎲", "Det er din tur i Yatzy-kampen", "Kampen din venter 👀", "{name} venter på trekket ditt"],
  da: ["{name} venter 🎲", "Det er din tur i Yatzy-kampen", "Din kamp venter 👀", "{name} venter på dit træk"],
  fi: ["{name} odottaa 🎲", "On sinun vuorosi Yatzy-pelissä", "Pelisi odottaa 👀", "{name} odottaa siirtoasi"],
  es: ["{name} te espera 🎲", "Es tu turno en la partida de Yatzy", "Tu partida te espera 👀", "{name} espera tu jugada"],
  fr: ["{name} attend 🎲", "C'est ton tour dans la partie de Yatzy", "Ta partie t'attend 👀", "{name} attend ton coup"],
  it: ["{name} ti aspetta 🎲", "Tocca a te nella partita di Yatzy", "La tua partita ti aspetta 👀", "{name} aspetta la tua mossa"],
  de: ["{name} wartet 🎲", "Du bist dran im Yatzy-Spiel", "Dein Spiel wartet 👀", "{name} wartet auf deinen Zug"],
  nl: ["{name} wacht 🎲", "Jij bent aan de beurt in het Yatzy-spel", "Je spel wacht 👀", "{name} wacht op je zet"],
  ca: ["{name} t'espera 🎲", "És el teu torn a la partida de Yatzy", "La teva partida t'espera 👀", "{name} espera la teva jugada"],
  ro: ["{name} așteaptă 🎲", "E rândul tău în meciul de Yatzy", "Meciul tău te așteaptă 👀", "{name} așteaptă mutarea ta"],
  tr: ["{name} bekliyor 🎲", "Yatzy maçında sıra sende", "Maçın seni bekliyor 👀", "{name} hamleni bekliyor"],
  pl: ["{name} czeka 🎲", "Twoja kolej w meczu Yatzy", "Twój mecz czeka 👀", "{name} czeka na twój ruch"],
  cs: ["{name} čeká 🎲", "Jsi na tahu v zápase Yatzy", "Tvůj zápas čeká 👀", "{name} čeká na tvůj tah"],
  sk: ["{name} čaká 🎲", "Si na ťahu v zápase Yatzy", "Tvoj zápas čaká 👀", "{name} čaká na tvoj ťah"],
  sl: ["{name} čaka 🎲", "Na vrsti si v igri Yatzy", "Tvoja igra čaka 👀", "{name} čaka na tvojo potezo"],
  hr: ["{name} čeka 🎲", "Ti si na redu u Yatzy meču", "Tvoj meč čeka 👀", "{name} čeka tvoj potez"],
  hu: ["{name} vár 🎲", "Te következel a Yatzy-meccsen", "A meccsed vár 👀", "{name} a lépésedre vár"],
  pt: ["{name} está à espera 🎲", "É a tua vez no jogo de Yatzy", "O teu jogo está à espera 👀", "{name} está à espera da tua jogada"],
  "pt-BR": ["{name} está esperando 🎲", "É a sua vez na partida de Yatzy", "Sua partida está esperando 👀", "{name} está esperando sua jogada"],
  id: ["{name} menunggu 🎲", "Giliranmu di pertandingan Yatzy", "Pertandinganmu menunggu 👀", "{name} menunggu langkahmu"],
  ms: ["{name} sedang menunggu 🎲", "Giliran anda dalam perlawanan Yatzy", "Perlawanan anda menunggu 👀", "{name} menunggu giliran anda"],
  vi: ["{name} đang chờ 🎲", "Đến lượt bạn trong ván Yatzy", "Ván đấu của bạn đang chờ 👀", "{name} đang chờ nước đi của bạn"],
  el: ["Ο/Η {name} περιμένει 🎲", "Είναι η σειρά σου στο Yatzy", "Ο αγώνας σου περιμένει 👀", "Ο/Η {name} περιμένει την κίνησή σου"],
  ru: ["{name} ждёт 🎲", "Ваш ход в матче Yatzy", "Ваш матч ждёт 👀", "{name} ждёт вашего хода"],
  uk: ["{name} чекає 🎲", "Ваш хід у матчі Yatzy", "Ваш матч чекає 👀", "{name} чекає на ваш хід"],
  ja: ["{name}さんが待っています 🎲", "Yatzyの対戦であなたの番です", "対戦が待っています 👀", "{name}さんがあなたの手番を待っています"],
  ko: ["{name}님이 기다리고 있어요 🎲", "Yatzy 경기에서 당신 차례예요", "경기가 기다리고 있어요 👀", "{name}님이 당신의 차례를 기다려요"],
  th: ["{name} กำลังรอ 🎲", "ถึงตาคุณในเกม Yatzy แล้ว", "เกมของคุณกำลังรอ 👀", "{name} กำลังรอคุณเล่น"],
  hi: ["{name} इंतज़ार कर रहे हैं 🎲", "Yatzy मैच में आपकी बारी है", "आपका मैच इंतज़ार कर रहा है 👀", "{name} आपकी चाल का इंतज़ार कर रहे हैं"],
  bn: ["{name} অপেক্ষা করছে 🎲", "Yatzy ম্যাচে আপনার পালা", "আপনার ম্যাচ অপেক্ষা করছে 👀", "{name} আপনার চালের অপেক্ষায়"],
  gu: ["{name} રાહ જોઈ રહ્યા છે 🎲", "Yatzy મેચમાં તમારો વારો છે", "તમારી મેચ રાહ જોઈ રહી છે 👀", "{name} તમારી ચાલની રાહ જોઈ રહ્યા છે"],
  kn: ["{name} ಕಾಯುತ್ತಿದ್ದಾರೆ 🎲", "Yatzy ಪಂದ್ಯದಲ್ಲಿ ನಿಮ್ಮ ಸರದಿ", "ನಿಮ್ಮ ಪಂದ್ಯ ಕಾಯುತ್ತಿದೆ 👀", "{name} ನಿಮ್ಮ ನಡೆಗಾಗಿ ಕಾಯುತ್ತಿದ್ದಾರೆ"],
  ml: ["{name} കാത്തിരിക്കുന്നു 🎲", "Yatzy മത്സരത്തിൽ നിങ്ങളുടെ ഊഴം", "നിങ്ങളുടെ മത്സരം കാത്തിരിക്കുന്നു 👀", "{name} നിങ്ങളുടെ നീക്കത്തിനായി കാത്തിരിക്കുന്നു"],
  mr: ["{name} वाट पाहत आहेत 🎲", "Yatzy सामन्यात तुमची पाळी आहे", "तुमचा सामना वाट पाहत आहे 👀", "{name} तुमच्या चालीची वाट पाहत आहेत"],
  or: ["{name} ଅପେକ୍ଷା କରୁଛନ୍ତି 🎲", "Yatzy ମ୍ୟାଚରେ ଆପଣଙ୍କ ପାଳି", "ଆପଣଙ୍କ ମ୍ୟାଚ ଅପେକ୍ଷା କରୁଛି 👀", "{name} ଆପଣଙ୍କ ଚାଲ ପାଇଁ ଅପେକ୍ଷା କରୁଛନ୍ତି"],
  pa: ["{name} ਉਡੀਕ ਕਰ ਰਹੇ ਹਨ 🎲", "Yatzy ਮੈਚ ਵਿੱਚ ਤੁਹਾਡੀ ਵਾਰੀ ਹੈ", "ਤੁਹਾਡਾ ਮੈਚ ਉਡੀਕ ਰਿਹਾ ਹੈ 👀", "{name} ਤੁਹਾਡੀ ਚਾਲ ਦੀ ਉਡੀਕ ਕਰ ਰਹੇ ਹਨ"],
  ta: ["{name} காத்திருக்கிறார் 🎲", "Yatzy போட்டியில் உங்கள் முறை", "உங்கள் போட்டி காத்திருக்கிறது 👀", "{name} உங்கள் நகர்வுக்காக காத்திருக்கிறார்"],
  te: ["{name} ఎదురుచూస్తున్నారు 🎲", "Yatzy మ్యాచ్‌లో మీ వంతు", "మీ మ్యాచ్ ఎదురుచూస్తోంది 👀", "{name} మీ ఎత్తు కోసం ఎదురుచూస్తున్నారు"],
};

/** Unknown/missing language → Swedish (the app's default language). */
export function pushText(lang: string | null | undefined, kind: "turn" | "reminder", name: string) {
  const row = P[lang ?? ""] ?? P.sv;
  const [a, b] = kind === "turn" ? [row[0], row[1]] : [row[2], row[3]];
  const f = (s: string) => s.replace("{name}", name);
  return { title: f(a), body: f(b) };
}
