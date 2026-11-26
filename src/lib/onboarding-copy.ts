import { getLanguage, type Language } from '@/lib/profile';
import { getRankedGames } from '@/lib/local-stats';

/** First-launch quick-match hint and quick-match opponent notices, all 40 languages. */
type Copy = { hint: string; real: string; took: string; solo: string };

const COPY: Record<Language, Copy> = {
  sv: { hint: 'Börja här – spela direkt!', real: 'Riktig spelare online', took: '{name} (dator) tog över', solo: "Spela mot datorn" },
  en: { hint: 'Start here – play now!', real: 'Real player online', took: '{name} (computer) took over', solo: "Play the computer" },
  no: { hint: 'Start her – spill nå!', real: 'Ekte spiller på nett', took: '{name} (datamaskin) tok over', solo: "Spill mot datamaskinen" },
  da: { hint: 'Start her – spil nu!', real: 'Rigtig spiller online', took: '{name} (computer) overtog', solo: "Spil mod computeren" },
  fi: { hint: 'Aloita tästä – pelaa heti!', real: 'Oikea pelaaja verkossa', took: '{name} (tietokone) jatkaa', solo: "Pelaa tietokonetta vastaan" },
  es: { hint: 'Empieza aquí – ¡juega ya!', real: 'Jugador real en línea', took: '{name} (ordenador) tomó el relevo', solo: "Jugar contra el ordenador" },
  fr: { hint: 'Commence ici – joue maintenant !', real: 'Vrai joueur en ligne', took: '{name} (ordinateur) a pris le relais', solo: "Jouer contre l'ordinateur" },
  it: { hint: 'Inizia qui – gioca subito!', real: 'Giocatore reale online', took: '{name} (computer) ha preso il posto', solo: "Gioca contro il computer" },
  de: { hint: 'Hier starten – sofort spielen!', real: 'Echter Spieler online', took: '{name} (Computer) hat übernommen', solo: "Gegen den Computer spielen" },
  nl: { hint: 'Begin hier – speel direct!', real: 'Echte speler online', took: '{name} (computer) nam het over', solo: "Speel tegen de computer" },
  ca: { hint: 'Comença aquí – juga ara!', real: 'Jugador real en línia', took: '{name} (ordinador) ha pres el relleu', solo: "Juga contra l'ordinador" },
  ro: { hint: 'Începe aici – joacă acum!', real: 'Jucător real online', took: '{name} (computer) a preluat', solo: "Joacă cu calculatorul" },
  tr: { hint: 'Buradan başla – hemen oyna!', real: 'Gerçek oyuncu çevrimiçi', took: '{name} (bilgisayar) devraldı', solo: "Bilgisayara karşı oyna" },
  pl: { hint: 'Zacznij tutaj – graj od razu!', real: 'Prawdziwy gracz online', took: '{name} (komputer) przejął grę', solo: "Graj z komputerem" },
  cs: { hint: 'Začni tady – hraj hned!', real: 'Skutečný hráč online', took: '{name} (počítač) převzal hru', solo: "Hrát proti počítači" },
  sk: { hint: 'Začni tu – hraj hneď!', real: 'Skutočný hráč online', took: '{name} (počítač) prevzal hru', solo: "Hrať proti počítaču" },
  sl: { hint: 'Začni tukaj – igraj takoj!', real: 'Pravi igralec na spletu', took: '{name} (računalnik) je prevzel', solo: "Igraj proti računalniku" },
  hr: { hint: 'Počni ovdje – igraj odmah!', real: 'Pravi igrač online', took: '{name} (računalo) je preuzelo', solo: "Igraj protiv računala" },
  hu: { hint: 'Kezdd itt – játssz most!', real: 'Valódi játékos online', took: '{name} (gép) átvette', solo: "Játék a gép ellen" },
  pt: { hint: 'Começa aqui – joga já!', real: 'Jogador real online', took: '{name} (computador) assumiu', solo: "Jogar contra o computador" },
  'pt-BR': { hint: 'Comece aqui – jogue agora!', real: 'Jogador real online', took: '{name} (computador) assumiu', solo: "Jogar contra o computador" },
  id: { hint: 'Mulai di sini – main sekarang!', real: 'Pemain asli online', took: '{name} (komputer) mengambil alih', solo: "Main melawan komputer" },
  ms: { hint: 'Mula di sini – main sekarang!', real: 'Pemain sebenar dalam talian', took: '{name} (komputer) mengambil alih', solo: "Main menentang komputer" },
  vi: { hint: 'Bắt đầu tại đây – chơi ngay!', real: 'Người chơi thật trực tuyến', took: '{name} (máy) đã thay thế', solo: "Chơi với máy" },
  el: { hint: 'Ξεκίνα εδώ – παίξε τώρα!', real: 'Πραγματικός παίκτης online', took: '{name} (υπολογιστής) ανέλαβε', solo: "Παίξε με τον υπολογιστή" },
  ru: { hint: 'Начни здесь – играй сейчас!', real: 'Настоящий игрок онлайн', took: '{name} (компьютер) заменил игрока', solo: "Играть с компьютером" },
  uk: { hint: 'Почни тут – грай зараз!', real: 'Справжній гравець онлайн', took: '{name} (комп’ютер) замінив гравця', solo: "Грати з комп’ютером" },
  ja: { hint: 'ここから – すぐに遊ぼう！', real: 'オンラインの本物のプレイヤー', took: '{name}（コンピューター）が交代しました', solo: "コンピューターと対戦" },
  ko: { hint: '여기서 시작 – 바로 플레이!', real: '실제 온라인 플레이어', took: '{name}(컴퓨터)이(가) 대신합니다', solo: "컴퓨터와 대전" },
  th: { hint: 'เริ่มที่นี่ – เล่นเลย!', real: 'ผู้เล่นจริงออนไลน์', took: '{name} (คอมพิวเตอร์) เล่นแทน', solo: "เล่นกับคอมพิวเตอร์" },
  hi: { hint: 'यहाँ से शुरू करें – अभी खेलें!', real: 'असली खिलाड़ी ऑनलाइन', took: '{name} (कंप्यूटर) ने जगह ली', solo: "कंप्यूटर से खेलें" },
  bn: { hint: 'এখান থেকে শুরু – এখনই খেলুন!', real: 'আসল খেলোয়াড় অনলাইনে', took: '{name} (কম্পিউটার) দায়িত্ব নিল', solo: "কম্পিউটারের সাথে খেলুন" },
  gu: { hint: 'અહીંથી શરૂ કરો – હમણાં રમો!', real: 'સાચો ખેલાડી ઓનલાઇન', took: '{name} (કમ્પ્યુટર) એ જગ્યા લીધી', solo: "કમ્પ્યુટર સામે રમો" },
  kn: { hint: 'ಇಲ್ಲಿ ಪ್ರಾರಂಭಿಸಿ – ಈಗಲೇ ಆಡಿ!', real: 'ನಿಜವಾದ ಆಟಗಾರ ಆನ್‌ಲೈನ್', took: '{name} (ಕಂಪ್ಯೂಟರ್) ಸ್ಥಾನ ಪಡೆಯಿತು', solo: "ಕಂಪ್ಯೂಟರ್ ವಿರುದ್ಧ ಆಡಿ" },
  ml: { hint: 'ഇവിടെ തുടങ്ങൂ – ഇപ്പോൾ കളിക്കൂ!', real: 'യഥാർത്ഥ കളിക്കാരൻ ഓൺലൈനിൽ', took: '{name} (കമ്പ്യൂട്ടർ) ഏറ്റെടുത്തു', solo: "കമ്പ്യൂട്ടറിനെതിരെ കളിക്കൂ" },
  mr: { hint: 'इथून सुरू करा – आता खेळा!', real: 'खरा खेळाडू ऑनलाइन', took: '{name} (संगणक) ने जागा घेतली', solo: "संगणकाविरुद्ध खेळा" },
  or: { hint: 'ଏଠାରୁ ଆରମ୍ଭ କରନ୍ତୁ – ଏବେ ଖେଳନ୍ତୁ!', real: 'ପ୍ରକୃତ ଖେଳାଳି ଅନଲାଇନ', took: '{name} (କମ୍ପ୍ୟୁଟର) ସ୍ଥାନ ନେଲା', solo: "କମ୍ପ୍ୟୁଟର ସହ ଖେଳନ୍ତୁ" },
  pa: { hint: 'ਇੱਥੋਂ ਸ਼ੁਰੂ ਕਰੋ – ਹੁਣੇ ਖੇਡੋ!', real: 'ਅਸਲੀ ਖਿਡਾਰੀ ਆਨਲਾਈਨ', took: '{name} (ਕੰਪਿਊਟਰ) ਨੇ ਥਾਂ ਲਈ', solo: "ਕੰਪਿਊਟਰ ਨਾਲ ਖੇਡੋ" },
  ta: { hint: 'இங்கே தொடங்குங்கள் – இப்போதே விளையாடுங்கள்!', real: 'உண்மையான வீரர் ஆன்லைனில்', took: '{name} (கணினி) பொறுப்பேற்றது', solo: "கணினியுடன் விளையாடுங்கள்" },
  te: { hint: 'ఇక్కడ ప్రారంభించండి – ఇప్పుడే ఆడండి!', real: 'నిజమైన ఆటగాడు ఆన్‌లైన్', took: '{name} (కంప్యూటర్) బాధ్యత తీసుకుంది', solo: "కంప్యూటర్‌తో ఆడండి" },
};

export function onboardingCopy(lang: Language = getLanguage()): Copy {
  return COPY[lang] ?? COPY.en;
}

const HINT_KEY = 'mrb_quick_hint_done';
export function quickHintPending(): boolean {
  try { return localStorage.getItem(HINT_KEY) !== '1' && getRankedGames() === 0; } catch { return false; }
}
export function markQuickHintDone(): void {
  try { localStorage.setItem(HINT_KEY, '1'); } catch { /* ignore */ }
}
