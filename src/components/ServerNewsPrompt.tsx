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
  const { lang } = useTranslation();
  const [title, body] = TEXT[lang] ?? TEXT.en;
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center px-5 bg-background/70 backdrop-blur-sm"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}
        className="w-full max-w-sm rounded-3xl bg-secondary border border-game-gold/30 p-5 text-center game-shadow-soft"
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
            OK
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
