import type { Language } from '@/lib/profile';

// List names and buttons use the existing dictionaries.
const COPY: Record<Language, readonly [string, string]> = {
  sv: ['Veckopris!', 'Du kom på plats {rank} och har fått {xp} XP.'],
  en: ['Weekly prize!', 'You finished #{rank} and earned {xp} XP.'],
  no: ['Ukepremie!', 'Du kom på plass {rank} og fikk {xp} XP.'],
  da: ['Ugepræmie!', 'Du blev nummer {rank} og har fået {xp} XP.'],
  fi: ['Viikkopalkinto!', 'Sijoituit sijalle {rank} ja sait {xp} XP.'],
  es: ['¡Premio semanal!', 'Terminaste en el puesto {rank} y ganaste {xp} XP.'],
  fr: ['Récompense hebdomadaire !', 'Vous avez terminé à la place {rank} et gagné {xp} XP.'],
  it: ['Premio settimanale!', 'Hai raggiunto il posto {rank} e ottenuto {xp} XP.'],
  de: ['Wochenpreis!', 'Du hast Platz {rank} erreicht und {xp} XP erhalten.'],
  nl: ['Weekprijs!', 'Je eindigde op plaats {rank} en verdiende {xp} XP.'],
  ca: ['Premi setmanal!', 'Has acabat al lloc {rank} i has guanyat {xp} XP.'],
  ro: ['Premiu săptămânal!', 'Ai terminat pe locul {rank} și ai câștigat {xp} XP.'],
  tr: ['Haftalık ödül!', '{rank}. oldun ve {xp} XP kazandın.'],
  pl: ['Nagroda tygodniowa!', 'Zajmujesz miejsce {rank} i otrzymujesz {xp} XP.'],
  cs: ['Týdenní odměna!', 'Skončil jsi na místě {rank} a získal {xp} XP.'],
  sk: ['Týždenná odmena!', 'Skončil si na mieste {rank} a získal {xp} XP.'],
  sl: ['Tedenska nagrada!', 'Dosegel si mesto {rank} in prejel {xp} XP.'],
  hr: ['Tjedna nagrada!', 'Završio si na mjestu {rank} i osvojio {xp} XP.'],
  hu: ['Heti jutalom!', 'A(z) {rank}. helyen végeztél, és {xp} XP-t kaptál.'],
  pt: ['Prémio semanal!', 'Ficaste em {rank}º lugar e ganhaste {xp} XP.'],
  'pt-BR': ['Prêmio semanal!', 'Você ficou em {rank}º lugar e ganhou {xp} XP.'],
  id: ['Hadiah mingguan!', 'Kamu finis di peringkat {rank} dan mendapat {xp} XP.'],
  ms: ['Hadiah mingguan!', 'Anda mendapat tempat {rank} dan memperoleh {xp} XP.'],
  vi: ['Phần thưởng tuần!', 'Bạn đạt hạng {rank} và nhận {xp} XP.'],
  el: ['Εβδομαδιαίο βραβείο!', 'Τερμάτισες στη θέση {rank} και κέρδισες {xp} XP.'],
  ru: ['Недельная награда!', 'Вы заняли место {rank} и получили {xp} XP.'],
  uk: ['Тижнева нагорода!', 'Ви посіли місце {rank} та отримали {xp} XP.'],
  ja: ['週間報酬！', '{rank}位になり、{xp} XPを獲得しました。'],
  ko: ['주간 보상!', '{rank}위를 달성하여 {xp} XP를 받았습니다.'],
  th: ['รางวัลประจำสัปดาห์!', 'คุณได้อันดับ {rank} และได้รับ {xp} XP'],
  hi: ['साप्ताहिक पुरस्कार!', 'आपने {rank}वाँ स्थान पाया और {xp} XP अर्जित किए।'],
  bn: ['সাপ্তাহিক পুরস্কার!', 'আপনি {rank} নম্বর স্থান পেয়েছেন এবং {xp} XP অর্জন করেছেন।'],
  gu: ['સાપ્તાહિક ઇનામ!', 'તમે {rank}મું સ્થાન મેળવ્યું અને {xp} XP મેળવ્યા.'],
  kn: ['ವಾರದ ಬಹುಮಾನ!', 'ನೀವು {rank}ನೇ ಸ್ಥಾನ ಪಡೆದು {xp} XP ಗಳಿಸಿದ್ದೀರಿ.'],
  ml: ['പ്രതിവാര സമ്മാനം!', 'നിങ്ങൾ {rank}ാം സ്ഥാനം നേടി {xp} XP ലഭിച്ചു.'],
  mr: ['साप्ताहिक बक्षीस!', 'तुम्ही {rank}वा क्रमांक मिळवला आणि {xp} XP कमावले.'],
  or: ['ସାପ୍ତାହିକ ପୁରସ୍କାର!', 'ଆପଣ {rank} ନମ୍ବର ସ୍ଥାନ ଏବଂ {xp} XP ପାଇଛନ୍ତି।'],
  pa: ['ਹਫ਼ਤਾਵਾਰੀ ਇਨਾਮ!', 'ਤੁਸੀਂ {rank}ਵਾਂ ਸਥਾਨ ਹਾਸਲ ਕੀਤਾ ਅਤੇ {xp} XP ਕਮਾਏ।'],
  ta: ['வாரப் பரிசு!', 'நீங்கள் {rank}வது இடத்தைப் பெற்று {xp} XP பெற்றீர்கள்.'],
  te: ['వారపు బహుమతి!', 'మీరు {rank}వ స్థానంలో నిలిచి {xp} XP పొందారు.'],
};

export function weeklyRewardCopy(lang: Language) {
  const [title, result] = COPY[lang] ?? COPY.en;
  return { title, result: (rank: number, xp: number) => result.replace('{rank}', String(rank)).replace('{xp}', String(xp)) };
}