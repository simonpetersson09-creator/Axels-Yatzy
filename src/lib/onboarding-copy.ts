import { getLanguage, type Language } from '@/lib/profile';
import { getRankedGames } from '@/lib/local-stats';

/** First-launch quick-match hint and quick-match opponent notices, all 40 languages. */
type Copy = { hint: string; real: string; took: string };

const COPY: Record<Language, Copy> = {
  sv: { hint: 'Börja här – spela direkt!', real: 'Riktig spelare online', took: '{name} (dator) tog över' },
  en: { hint: 'Start here – play now!', real: 'Real player online', took: '{name} (computer) took over' },
  no: { hint: 'Start her – spill nå!', real: 'Ekte spiller på nett', took: '{name} (datamaskin) tok over' },
  da: { hint: 'Start her – spil nu!', real: 'Rigtig spiller online', took: '{name} (computer) overtog' },
  fi: { hint: 'Aloita tästä – pelaa heti!', real: 'Oikea pelaaja verkossa', took: '{name} (tietokone) jatkaa' },
  es: { hint: 'Empieza aquí – ¡juega ya!', real: 'Jugador real en línea', took: '{name} (ordenador) tomó el relevo' },
  fr: { hint: 'Commence ici – joue maintenant !', real: 'Vrai joueur en ligne', took: '{name} (ordinateur) a pris le relais' },
  it: { hint: 'Inizia qui – gioca subito!', real: 'Giocatore reale online', took: '{name} (computer) ha preso il posto' },
  de: { hint: 'Hier starten – sofort spielen!', real: 'Echter Spieler online', took: '{name} (Computer) hat übernommen' },
  nl: { hint: 'Begin hier – speel direct!', real: 'Echte speler online', took: '{name} (computer) nam het over' },
  ca: { hint: 'Comença aquí – juga ara!', real: 'Jugador real en línia', took: '{name} (ordinador) ha pres el relleu' },
  ro: { hint: 'Începe aici – joacă acum!', real: 'Jucător real online', took: '{name} (computer) a preluat' },
  tr: { hint: 'Buradan başla – hemen oyna!', real: 'Gerçek oyuncu çevrimiçi', took: '{name} (bilgisayar) devraldı' },
  pl: { hint: 'Zacznij tutaj – graj od razu!', real: 'Prawdziwy gracz online', took: '{name} (komputer) przejął grę' },
  cs: { hint: 'Začni tady – hraj hned!', real: 'Skutečný hráč online', took: '{name} (počítač) převzal hru' },
  sk: { hint: 'Začni tu – hraj hneď!', real: 'Skutočný hráč online', took: '{name} (počítač) prevzal hru' },
  sl: { hint: 'Začni tukaj – igraj takoj!', real: 'Pravi igralec na spletu', took: '{name} (računalnik) je prevzel' },
  hr: { hint: 'Počni ovdje – igraj odmah!', real: 'Pravi igrač online', took: '{name} (računalo) je preuzelo' },
  hu: { hint: 'Kezdd itt – játssz most!', real: 'Valódi játékos online', took: '{name} (gép) átvette' },
  pt: { hint: 'Começa aqui – joga já!', real: 'Jogador real online', took: '{name} (computador) assumiu' },
  'pt-BR': { hint: 'Comece aqui – jogue agora!', real: 'Jogador real online', took: '{name} (computador) assumiu' },
  id: { hint: 'Mulai di sini – main sekarang!', real: 'Pemain asli online', took: '{name} (komputer) mengambil alih' },
  ms: { hint: 'Mula di sini – main sekarang!', real: 'Pemain sebenar dalam talian', took: '{name} (komputer) mengambil alih' },
  vi: { hint: 'Bắt đầu tại đây – chơi ngay!', real: 'Người chơi thật trực tuyến', took: '{name} (máy) đã thay thế' },
  el: { hint: 'Ξεκίνα εδώ – παίξε τώρα!', real: 'Πραγματικός παίκτης online', took: '{name} (υπολογιστής) ανέλαβε' },
  ru: { hint: 'Начни здесь – играй сейчас!', real: 'Настоящий игрок онлайн', took: '{name} (компьютер) заменил игрока' },
  uk: { hint: 'Почни тут – грай зараз!', real: 'Справжній гравець онлайн', took: '{name} (комп’ютер) замінив гравця' },
  ja: { hint: 'ここから – すぐに遊ぼう！', real: 'オンラインの本物のプレイヤー', took: '{name}（コンピューター）が交代しました' },
  ko: { hint: '여기서 시작 – 바로 플레이!', real: '실제 온라인 플레이어', took: '{name}(컴퓨터)이(가) 대신합니다' },
  th: { hint: 'เริ่มที่นี่ – เล่นเลย!', real: 'ผู้เล่นจริงออนไลน์', took: '{name} (คอมพิวเตอร์) เล่นแทน' },
  hi: { hint: 'यहाँ से शुरू करें – अभी खेलें!', real: 'असली खिलाड़ी ऑनलाइन', took: '{name} (कंप्यूटर) ने जगह ली' },
  bn: { hint: 'এখান থেকে শুরু – এখনই খেলুন!', real: 'আসল খেলোয়াড় অনলাইনে', took: '{name} (কম্পিউটার) দায়িত্ব নিল' },
  gu: { hint: 'અહીંથી શરૂ કરો – હમણાં રમો!', real: 'સાચો ખેલાડી ઓનલાઇન', took: '{name} (કમ્પ્યુટર) એ જગ્યા લીધી' },
  kn: { hint: 'ಇಲ್ಲಿ ಪ್ರಾರಂಭಿಸಿ – ಈಗಲೇ ಆಡಿ!', real: 'ನಿಜವಾದ ಆಟಗಾರ ಆನ್‌ಲೈನ್', took: '{name} (ಕಂಪ್ಯೂಟರ್) ಸ್ಥಾನ ಪಡೆಯಿತು' },
  ml: { hint: 'ഇവിടെ തുടങ്ങൂ – ഇപ്പോൾ കളിക്കൂ!', real: 'യഥാർത്ഥ കളിക്കാരൻ ഓൺലൈനിൽ', took: '{name} (കമ്പ്യൂട്ടർ) ഏറ്റെടുത്തു' },
  mr: { hint: 'इथून सुरू करा – आता खेळा!', real: 'खरा खेळाडू ऑनलाइन', took: '{name} (संगणक) ने जागा घेतली' },
  or: { hint: 'ଏଠାରୁ ଆରମ୍ଭ କରନ୍ତୁ – ଏବେ ଖେଳନ୍ତୁ!', real: 'ପ୍ରକୃତ ଖେଳାଳି ଅନଲାଇନ', took: '{name} (କମ୍ପ୍ୟୁଟର) ସ୍ଥାନ ନେଲା' },
  pa: { hint: 'ਇੱਥੋਂ ਸ਼ੁਰੂ ਕਰੋ – ਹੁਣੇ ਖੇਡੋ!', real: 'ਅਸਲੀ ਖਿਡਾਰੀ ਆਨਲਾਈਨ', took: '{name} (ਕੰਪਿਊਟਰ) ਨੇ ਥਾਂ ਲਈ' },
  ta: { hint: 'இங்கே தொடங்குங்கள் – இப்போதே விளையாடுங்கள்!', real: 'உண்மையான வீரர் ஆன்லைனில்', took: '{name} (கணினி) பொறுப்பேற்றது' },
  te: { hint: 'ఇక్కడ ప్రారంభించండి – ఇప్పుడే ఆడండి!', real: 'నిజమైన ఆటగాడు ఆన్‌లైన్', took: '{name} (కంప్యూటర్) బాధ్యత తీసుకుంది' },
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
