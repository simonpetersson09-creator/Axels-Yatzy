import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Copy, Check, Users } from 'lucide-react';
import type { Player } from '@/types/yatzy';
import { useTranslation } from '@/lib/i18n';

interface LobbyWaitingRoomProps {
  gameCode: string;
  players: Player[];
  myPlayerIndex: number | null;
  onStart: () => void;
}

export function LobbyWaitingRoom({ gameCode, players, myPlayerIndex, onStart }: LobbyWaitingRoomProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const isHost = myPlayerIndex === 0;

  const copyCode = () => {
    navigator.clipboard.writeText(gameCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          <h1 className="text-2xl font-display font-bold">{t('waitingForPlayers')}</h1>
        </div>

        {/* Game code */}
        <div className="glass-card p-6 text-center space-y-3">
          <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">{t('gameCode')}</p>
          <div className="flex items-center justify-center gap-3">
            <span className="text-4xl font-display font-bold text-gold-gradient tracking-[0.3em]">
              {gameCode}
            </span>
            <button onClick={copyCode} className="p-2 rounded-lg hover:bg-secondary transition-colors">
              {copied ? <Check className="w-5 h-5 text-game-success" /> : <Copy className="w-5 h-5 text-muted-foreground" />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">{t('shareCode')}</p>
        </div>

        {/* Players list */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Spelare ({players.length}/4)
            </span>
          </div>
          <div className="space-y-2">
            {players.map((player, i) => (
              <motion.div
                key={player.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="glass-card px-4 py-3 flex items-center gap-3"
              >
                <div className={`w-3 h-3 rounded-full ${
                  i === 0 ? 'bg-yatzy-player1' : i === 1 ? 'bg-yatzy-player2' : i === 2 ? 'bg-yatzy-player3' : 'bg-yatzy-player4'
                }`} />
                <span className="font-medium text-foreground">{player.name}</span>
                {i === 0 && <span className="ml-auto text-[10px] text-primary font-bold uppercase tracking-wider">Värd</span>}
                {i === myPlayerIndex && i !== 0 && (
                  <span className="ml-auto text-[10px] text-game-success font-bold uppercase tracking-wider">Du</span>
                )}
              </motion.div>
            ))}
          </div>
        </div>

        {isHost && players.length >= 2 && (
          <motion.button
            onClick={onStart}
            className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-display font-bold text-lg game-shadow"
            whileTap={{ scale: 0.97 }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            Starta spel
          </motion.button>
        )}

        {isHost && players.length < 2 && (
          <p className="text-center text-sm text-muted-foreground">Väntar på minst en spelare till...</p>
        )}

        {!isHost && (
          <p className="text-center text-sm text-muted-foreground">Väntar på att värden startar spelet...</p>
        )}
      </motion.div>
    </div>
  );
}
