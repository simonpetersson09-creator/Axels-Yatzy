import type { Language } from './profile';

type Copy = { online: string; computer: string; search: string; start: string };
const COPY: Record<Language, [string, string, string, string]> = {
  sv: ['Online', 'Mot datorn', 'Sök spelare', 'Starta match'],
  en: ['Online', 'Vs computer', 'Find players', 'Start match'],
  no: ['Online', 'Mot datamaskinen', 'Søk spillere', 'Start kamp'],
  da: ['Online', 'Mod computeren', 'Find spillere', 'Start kamp'],
  fi: ['Verkossa', 'Tietokonetta vastaan', 'Etsi pelaajia', 'Aloita peli'],
  es: ['En línea', 'Contra el ordenador', 'Buscar jugadores', 'Iniciar partida'],
  fr: ['En ligne', 'Contre l’ordinateur', 'Chercher des joueurs', 'Lancer la partie'],
  it: ['Online', 'Contro il computer', 'Cerca giocatori', 'Inizia partita'],
  de: ['Online', 'Gegen Computer', 'Spieler suchen', 'Spiel starten'],
  nl: ['Online', 'Tegen computer', 'Spelers zoeken', 'Start spel'],
  ca: ['En línia', 'Contra l’ordinador', 'Cerca jugadors', 'Comença la partida'],
  ro: ['Online', 'Contra calculatorului', 'Caută jucători', 'Începe partida'],
  tr: ['Çevrimiçi', 'Bilgisayara karşı', 'Oyuncu ara', 'Oyunu başlat'],
  pl: ['Online', 'Przeciw komputerowi', 'Szukaj graczy', 'Rozpocznij grę'],
  cs: ['Online', 'Proti počítači', 'Hledat hráče', 'Začít hru'],
  sk: ['Online', 'Proti počítaču', 'Hľadať hráčov', 'Začať hru'],
  sl: ['Na spletu', 'Proti računalniku', 'Poišči igralce', 'Začni igro'],
  hr: ['Online', 'Protiv računala', 'Traži igrače', 'Započni igru'],
  hu: ['Online', 'Számítógép ellen', 'Játékosok keresése', 'Játék indítása'],
  pt: ['Online', 'Contra o computador', 'Procurar jogadores', 'Iniciar partida'],
  'pt-BR': ['Online', 'Contra o computador', 'Buscar jogadores', 'Iniciar partida'],
  id: ['Online', 'Lawan komputer', 'Cari pemain', 'Mulai permainan'],
  ms: ['Dalam talian', 'Lawan komputer', 'Cari pemain', 'Mulakan permainan'],
  vi: ['Trực tuyến', 'Đấu với máy', 'Tìm người chơi', 'Bắt đầu trận'],
  el: ['Online', 'Με υπολογιστή', 'Εύρεση παικτών', 'Έναρξη παιχνιδιού'],
  ru: ['Онлайн', 'Против компьютера', 'Найти игроков', 'Начать игру'],
  uk: ['Онлайн', 'Проти комп’ютера', 'Знайти гравців', 'Почати гру'],
  ja: ['オンライン', 'コンピューターと対戦', 'プレイヤーを探す', '対戦開始'],
  ko: ['온라인', '컴퓨터 대전', '플레이어 찾기', '게임 시작'],
  th: ['ออนไลน์', 'แข่งกับคอมพิวเตอร์', 'ค้นหาผู้เล่น', 'เริ่มเกม'],
  hi: ['ऑनलाइन', 'कंप्यूटर के विरुद्ध', 'खिलाड़ी खोजें', 'खेल शुरू करें'],
  bn: ['অনলাইন', 'কম্পিউটারের বিরুদ্ধে', 'খেলোয়াড় খুঁজুন', 'খেলা শুরু করুন'],
  gu: ['ઓનલાઇન', 'કમ્પ્યુટર સામે', 'ખેલાડીઓ શોધો', 'રમત શરૂ કરો'],
  kn: ['ಆನ್‌ಲೈನ್', 'ಕಂಪ್ಯೂಟರ್ ವಿರುದ್ಧ', 'ಆಟಗಾರರನ್ನು ಹುಡುಕಿ', 'ಆಟ ಪ್ರಾರಂಭಿಸಿ'],
  ml: ['ഓൺലൈൻ', 'കമ്പ്യൂട്ടറിനെതിരെ', 'കളിക്കാരെ കണ്ടെത്തുക', 'കളി തുടങ്ങുക'],
  mr: ['ऑनलाइन', 'संगणकाविरुद्ध', 'खेळाडू शोधा', 'खेळ सुरू करा'],
  or: ['ଅନଲାଇନ', 'କମ୍ପ୍ୟୁଟର ବିରୁଦ୍ଧରେ', 'ଖେଳାଳି ଖୋଜନ୍ତୁ', 'ଖେଳ ଆରମ୍ଭ କରନ୍ତୁ'],
  pa: ['ਆਨਲਾਈਨ', 'ਕੰਪਿਊਟਰ ਵਿਰੁੱਧ', 'ਖਿਡਾਰੀ ਲੱਭੋ', 'ਖੇਡ ਸ਼ੁਰੂ ਕਰੋ'],
  ta: ['ஆன்லைன்', 'கணினிக்கு எதிராக', 'வீரர்களைத் தேடு', 'ஆட்டத்தைத் தொடங்கு'],
  te: ['ఆన్‌లైన్', 'కంప్యూటర్‌తో', 'ఆటగాళ్లను వెతకండి', 'ఆట ప్రారంభించండి'],
};

export function quickMatchCopy(lang: Language): Copy {
  const [online, computer, search, start] = COPY[lang];
  return { online, computer, search, start };
}