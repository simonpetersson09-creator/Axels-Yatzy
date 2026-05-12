import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPlayerName, setPlayerName as savePlayerName } from '@/lib/session';
import { motion } from 'framer-motion';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

const MAX_NAME_LENGTH = 20;
const NAME_REGEX = /^[\p{L}\p{N}\s\-_.!]+$/u;

interface LobbyJoinFormProps {
  loading: boolean;
  error: string | null;
  onCreateGame: (name: string) => void;
  onJoinGame: (code: string, name: string) => void;
}

function sanitizeName(raw: string): string {
  const trimmed = raw.trim().slice(0, MAX_NAME_LENGTH);
  if (!trimmed) return '';
  if (!NAME_REGEX.test(trimmed)) return '';
  return trimmed;
}

export function LobbyJoinForm({ loading, error, onCreateGame, onJoinGame }: LobbyJoinFormProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [playerName, setPlayerName] = useState(() => getPlayerName());
  const [joinCode, setJoinCode] = useState('');

  const handleCreate = () => {
    const name = sanitizeName(playerName) || 'Spelare 1';
    savePlayerName(name);
    onCreateGame(name);
  };

  const handleJoin = () => {
    const name = sanitizeName(playerName) || 'Spelare';
    savePlayerName(name);
    onJoinGame(joinCode.toUpperCase(), name);
  };

  return (
    <div className="app-screen px-6 py-8 safe-top safe-bottom overflow-y-auto overscroll-contain">
      <motion.div
        className="max-w-sm mx-auto space-y-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 -ml-2 rounded-xl hover:bg-secondary transition-colors">
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <h1 className="text-2xl font-display font-bold">{t('multiplayer')}</h1>
        </div>

        <div className="space-y-3">
          <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{t('yourName')}</label>
          <input
            type="text"
            value={playerName}
            onChange={e => setPlayerName(e.target.value.slice(0, MAX_NAME_LENGTH))}
            placeholder={t('enterYourName')}
            maxLength={MAX_NAME_LENGTH}
            className="w-full px-4 py-3 rounded-xl bg-secondary text-foreground placeholder:text-muted-foreground font-medium border border-border/50 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all"
          />
        </div>

        {error && (
          <motion.p className="text-destructive text-sm font-medium text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {error}
          </motion.p>
        )}

        <div className="space-y-3">
          <motion.button
            onClick={handleCreate}
            disabled={loading}
            className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-display font-bold text-lg game-shadow disabled:opacity-50"
            whileTap={{ scale: 0.97 }}
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Skapa spel'}
          </motion.button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">eller</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <input
            type="text"
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase())}
            placeholder="Ange spelkod"
            maxLength={6}
            className="w-full px-4 py-3 rounded-xl bg-secondary text-foreground placeholder:text-muted-foreground font-display font-bold text-center text-xl tracking-[0.3em] border border-border/50 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all uppercase"
          />
          <motion.button
            onClick={handleJoin}
            disabled={loading || joinCode.length < 6}
            className="w-full py-4 rounded-2xl bg-secondary text-foreground font-display font-bold text-lg border border-border/50 disabled:opacity-50"
            whileTap={{ scale: 0.97 }}
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Gå med'}
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}
