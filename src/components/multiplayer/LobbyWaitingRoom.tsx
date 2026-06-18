import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Copy, Check, Users, Share2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
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

  const shareInvite = async () => {
    const webOrigin = 'https://mrb-yatzy.lovable.app';
    const isNative = Capacitor.isNativePlatform();
    const origin = isNative ? webOrigin : window.location.origin;
    const joinUrl = `${origin}/multiplayer?code=${gameCode}`;
    const text = `${t('gameCode')}: ${gameCode}\n${joinUrl}`;

    try {
      if (isNative) {
        await Share.share({
          title: 'Mr.B. Yatzy',
          text,
          url: joinUrl,
          dialogTitle: 'Dela inbjudan',
        });
        return;
      }
      if (navigator.share) {
        await navigator.share({ title: 'Mr.B. Yatzy', text, url: joinUrl });
        return;
      }
      await navigator.clipboard.writeText(text);
      toast.success('Inbjudan kopierad');
    } catch (err: any) {
      if (err?.message?.toLowerCase?.().includes('cancel')) return;
      if (err?.name === 'AbortError') return;
      console.error('[shareInvite] failed', err);
      try {
        await navigator.clipboard.writeText(text);
        toast.success('Inbjudan kopierad');
      } catch {
        toast.error('Kunde inte dela inbjudan');
      }
    }
  };

  return (
    <div className="app-fixed-screen px-6 py-8 safe-top safe-bottom overflow-y-scroll overscroll-contain">
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
          <button
            onClick={shareInvite}
            className="w-full py-3 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors flex items-center justify-center gap-2 text-sm font-semibold text-foreground"
          >
            <Share2 className="w-4 h-4" />
            {t('shareInvite')}
          </button>
          <div className="flex flex-col items-center gap-2 pt-2">
            <div className="bg-white p-2 rounded-xl">
              <QRCodeSVG value={`${window.location.origin}/multiplayer?code=${gameCode}`} size={140} />
            </div>
            <p className="text-xs text-muted-foreground">{t('scanQR')}</p>
          </div>
        </div>

        {/* Players list */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              {t('playersOfMax', { count: players.length })}
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
                {i === 0 && <span className="ml-auto text-[10px] text-primary font-bold uppercase tracking-wider">{t('host')}</span>}
                {i === myPlayerIndex && i !== 0 && (
                  <span className="ml-auto text-[10px] text-game-success font-bold uppercase tracking-wider">{t('you')}</span>
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
            {t('startGame')}
          </motion.button>
        )}

        {isHost && players.length < 2 && (
          <p className="text-center text-sm text-muted-foreground">{t('waitingMorePlayers')}</p>
        )}

        {!isHost && (
          <p className="text-center text-sm text-muted-foreground">{t('waitingForHost')}</p>
        )}
      </motion.div>
    </div>
  );
}
