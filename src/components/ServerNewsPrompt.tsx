import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

const SEEN_KEY = 'mrbyatzy_server_news_seen_v1';
// Stop showing after this date — new installs later don't need the apology.
const SHOW_UNTIL = Date.parse('2026-11-15T00:00:00Z');

const TEXT: Record<string, [string, string]> = {
  sv: ['Mr.B. Yatzy är snabbare nu 🎲', 'Förlåt för strulet de senaste dagarna. Vi har uppgraderat servern och förbättrat spelet. Tack för att du spelar!'],
  en: ['Mr.B. Yatzy is faster now 🎲', "Sorry for the trouble the last few days. We've upgraded the server and improved the game. Thanks for playing!"],
  no: ['Mr.B. Yatzy er raskere nå 🎲', 'Beklager trøbbelet de siste dagene. Vi har oppgradert serveren og forbedret spillet. Takk for at du spiller!'],
  da: ['Mr.B. Yatzy er hurtigere nu 🎲', 'Undskyld for bøvlet de seneste dage. Vi har opgraderet serveren og forbedret spillet. Tak fordi du spiller!'],
  fi: ['Mr.B. Yatzy on nyt nopeampi 🎲', 'Pahoittelut viime päivien ongelmista. Päivitimme palvelimen ja paransimme peliä. Kiitos että pelaat!'],
  de: ['Mr.B. Yatzy ist jetzt schneller 🎲', 'Entschuldige die Probleme der letzten Tage. Wir haben den Server aufgerüstet und das Spiel verbessert. Danke fürs Spielen!'],
  es: ['Mr.B. Yatzy ahora es más rápido 🎲', 'Perdón por los problemas de los últimos días. Hemos mejorado el servidor y el juego. ¡Gracias por jugar!'],
  fr: ['Mr.B. Yatzy est plus rapide 🎲', 'Désolé pour les soucis de ces derniers jours. Nous avons amélioré le serveur et le jeu. Merci de jouer !'],
  "it": ["Mr.B. Yatzy è più veloce ora 🎲", "Ci scusiamo per i problemi degli ultimi giorni. Abbiamo potenziato il server e migliorato il gioco. Grazie per giocare!"],
  "nl": ["Mr.B. Yatzy is nu sneller 🎲", "Sorry voor de problemen van de afgelopen dagen. We hebben de server verbeterd en het spel vernieuwd. Bedankt dat je speelt!"],
  "ca": ["Mr.B. Yatzy ara és més ràpid 🎲", "Disculpa els problemes dels últims dies. Hem millorat el servidor i el joc. Gràcies per jugar!"],
  "ro": ["Mr.B. Yatzy este acum mai rapid 🎲", "Ne cerem scuze pentru problemele din ultimele zile. Am îmbunătățit serverul și jocul. Mulțumim că joci!"],
  "tr": ["Mr.B. Yatzy artık daha hızlı 🎲", "Son birkaç gündeki sorunlar için özür dileriz. Sunucuyu yükselttik ve oyunu geliştirdik. Oynadığın için teşekkürler!"],
  "pl": ["Mr.B. Yatzy działa teraz szybciej 🎲", "Przepraszamy za problemy w ostatnich dniach. Ulepszyliśmy serwer i grę. Dziękujemy, że grasz!"],
  "cs": ["Mr.B. Yatzy je teď rychlejší 🎲", "Omlouváme se za problémy v posledních dnech. Vylepšili jsme server i hru. Děkujeme, že hraješ!"],
  "sk": ["Mr.B. Yatzy je teraz rýchlejší 🎲", "Ospravedlňujeme sa za problémy v posledných dňoch. Vylepšili sme server aj hru. Ďakujeme, že hráš!"],
  "sl": ["Mr.B. Yatzy je zdaj hitrejši 🎲", "Oprosti za težave v zadnjih dneh. Nadgradili smo strežnik in izboljšali igro. Hvala, ker igraš!"],
  "hr": ["Mr.B. Yatzy je sada brži 🎲", "Ispričavamo se zbog problema proteklih dana. Nadogradili smo poslužitelj i poboljšali igru. Hvala što igraš!"],
  "hu": ["A Mr.B. Yatzy most gyorsabb 🎲", "Elnézést az elmúlt napok problémáiért. Frissítettük a szervert és javítottuk a játékot. Köszönjük, hogy játszol!"],
  "pt": ["Mr.B. Yatzy está mais rápido 🎲", "Pedimos desculpa pelos problemas dos últimos dias. Melhorámos o servidor e o jogo. Obrigado por jogares!"],
  "pt-BR": ["Mr.B. Yatzy está mais rápido 🎲", "Desculpe pelos problemas dos últimos dias. Atualizamos o servidor e melhoramos o jogo. Obrigado por jogar!"],
  "id": ["Mr.B. Yatzy sekarang lebih cepat 🎲", "Maaf atas kendala beberapa hari terakhir. Kami telah meningkatkan server dan memperbaiki permainan. Terima kasih sudah bermain!"],
  "ms": ["Mr.B. Yatzy kini lebih pantas 🎲", "Maaf atas masalah beberapa hari kebelakangan ini. Kami telah menaik taraf pelayan dan menambah baik permainan. Terima kasih kerana bermain!"],
  "vi": ["Mr.B. Yatzy giờ nhanh hơn 🎲", "Xin lỗi vì sự cố trong những ngày qua. Chúng tôi đã nâng cấp máy chủ và cải thiện trò chơi. Cảm ơn bạn đã chơi!"],
  "el": ["Το Mr.B. Yatzy είναι τώρα πιο γρήγορο 🎲", "Συγγνώμη για τα προβλήματα των τελευταίων ημερών. Αναβαθμίσαμε τον διακομιστή και βελτιώσαμε το παιχνίδι. Ευχαριστούμε που παίζεις!"],
  "ru": ["Mr.B. Yatzy теперь быстрее 🎲", "Извините за неполадки в последние дни. Мы обновили сервер и улучшили игру. Спасибо, что играете!"],
  "uk": ["Mr.B. Yatzy тепер швидший 🎲", "Перепрошуємо за проблеми останніх днів. Ми оновили сервер і покращили гру. Дякуємо, що граєте!"],
  "ja": ["Mr.B. Yatzyがもっと快適に 🎲", "ここ数日の不具合についてお詫びします。サーバーを強化し、ゲームを改善しました。遊んでくれてありがとう！"],
  "ko": ["Mr.B. Yatzy가 더 빨라졌어요 🎲", "최근 며칠간의 불편에 사과드립니다. 서버를 업그레이드하고 게임을 개선했습니다. 플레이해 주셔서 감사합니다!"],
  "th": ["Mr.B. Yatzy เร็วขึ้นแล้ว 🎲", "ขออภัยสำหรับปัญหาในช่วงไม่กี่วันที่ผ่านมา เราได้อัปเกรดเซิร์ฟเวอร์และปรับปรุงเกม ขอบคุณที่เล่น!"],
  "hi": ["Mr.B. Yatzy अब और तेज़ है 🎲", "पिछले कुछ दिनों की परेशानी के लिए माफ़ी। हमने सर्वर अपग्रेड किया है और खेल बेहतर बनाया है। खेलने के लिए धन्यवाद!"],
  "bn": ["Mr.B. Yatzy এখন আরও দ্রুত 🎲", "গত কয়েক দিনের সমস্যার জন্য দুঃখিত। আমরা সার্ভার উন্নত করেছি এবং খেলাটি আরও ভালো করেছি। খেলার জন্য ধন্যবাদ!"],
  "gu": ["Mr.B. Yatzy હવે વધુ ઝડપી છે 🎲", "છેલ્લા થોડા દિવસોની મુશ્કેલી માટે માફ કરશો. અમે સર્વર અપગ્રેડ કર્યું છે અને રમત સુધારી છે. રમવા બદલ આભાર!"],
  "kn": ["Mr.B. Yatzy ಈಗ ಇನ್ನಷ್ಟು ವೇಗವಾಗಿದೆ 🎲", "ಕಳೆದ ಕೆಲವು ದಿನಗಳ ತೊಂದರೆಗೆ ಕ್ಷಮಿಸಿ. ನಾವು ಸರ್ವರ್ ಅನ್ನು ನವೀಕರಿಸಿ ಆಟವನ್ನು ಸುಧಾರಿಸಿದ್ದೇವೆ. ಆಡುತ್ತಿರುವುದಕ್ಕೆ ಧನ್ಯವಾದಗಳು!"],
  "ml": ["Mr.B. Yatzy ഇപ്പോൾ കൂടുതൽ വേഗത്തിലാണ് 🎲", "കഴിഞ്ഞ ദിവസങ്ങളിലെ പ്രശ്നങ്ങൾക്ക് ക്ഷമിക്കണം. ഞങ്ങൾ സെർവർ നവീകരിക്കുകയും കളി മെച്ചപ്പെടുത്തുകയും ചെയ്തു. കളിക്കുന്നതിന് നന്ദി!"],
  "mr": ["Mr.B. Yatzy आता अधिक वेगवान 🎲", "गेल्या काही दिवसांच्या त्रासाबद्दल क्षमस्व. आम्ही सर्व्हर अपग्रेड केला आहे आणि खेळ सुधारला आहे. खेळल्याबद्दल धन्यवाद!"],
  "or": ["Mr.B. Yatzy ଏବେ ଆହୁରି ଦ୍ରୁତ 🎲", "ଗତ କିଛି ଦିନର ସମସ୍ୟା ପାଇଁ କ୍ଷମା କରନ୍ତୁ। ଆମେ ସର୍ଭରକୁ ଉନ୍ନତ କରି ଖେଳକୁ ସୁଧାରିଛୁ। ଖେଳୁଥିବାରୁ ଧନ୍ୟବାଦ!"],
  "pa": ["Mr.B. Yatzy ਹੁਣ ਹੋਰ ਤੇਜ਼ ਹੈ 🎲", "ਪਿਛਲੇ ਕੁਝ ਦਿਨਾਂ ਦੀ ਪਰੇਸ਼ਾਨੀ ਲਈ ਮਾਫ਼ੀ। ਅਸੀਂ ਸਰਵਰ ਅੱਪਗ੍ਰੇਡ ਕੀਤਾ ਹੈ ਅਤੇ ਖੇਡ ਸੁਧਾਰੀ ਹੈ। ਖੇਡਣ ਲਈ ਧੰਨਵਾਦ!"],
  "ta": ["Mr.B. Yatzy இப்போது வேகமாக உள்ளது 🎲", "கடந்த சில நாட்களில் ஏற்பட்ட சிக்கல்களுக்கு மன்னிக்கவும். சேவையகத்தை மேம்படுத்தி விளையாட்டைச் சிறப்பாக்கியுள்ளோம். விளையாடுவதற்கு நன்றி!"],
  "te": ["Mr.B. Yatzy ఇప్పుడు మరింత వేగంగా ఉంది 🎲", "గత కొన్ని రోజుల సమస్యలకు క్షమించండి. మేము సర్వర్‌ను అప్‌గ్రేడ్ చేసి ఆటను మెరుగుపరిచాము. ఆడుతున్నందుకు ధన్యవాదాలు!"],
};

/** One-time box for existing players: server upgraded + apology. */
export function shouldShowServerNews(gamesPlayed: number): boolean {
  try {
    if (Date.now() > SHOW_UNTIL || localStorage.getItem(SEEN_KEY)) return false;
    if (gamesPlayed <= 0) { localStorage.setItem(SEEN_KEY, '1'); return false; }
    return true;
  } catch { return false; }
}

export function markServerNewsSeen() {
  try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* noop */ }
}

export default function ServerNewsPrompt({ onClose }: { onClose: () => void }) {
  const { lang, t } = useTranslation();
  const [title, body] = TEXT[lang] ?? TEXT.en;
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center px-5 bg-background/70 backdrop-blur-sm"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}
        className="w-full max-w-sm max-h-[calc(100dvh-96px)] overflow-y-auto break-words rounded-3xl bg-secondary border border-game-gold/30 p-5 text-center game-shadow-soft"
        initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16 }}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary/15 flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-lg font-display font-bold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
          <motion.button onClick={onClose} whileTap={{ scale: 0.97 }}
            className="w-full mt-1 py-3 rounded-2xl bg-primary text-primary-foreground font-display font-bold text-sm">
            {t('ok')}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
