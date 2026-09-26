import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/i18n';
import { getPlayerName, getSessionId, claimSession } from '@/lib/session';
import { findOrJoinMatch, leaveMatchmaking } from '@/lib/matchmaking';
import { getRandomAiNames } from '@/lib/yatzy-ai';
import { countActiveLocalGames, newLocalGameId, MAX_ACTIVE_LOCAL_GAMES } from '@/lib/active-game';
import { trackEvent } from '@/lib/analytics';

const SEARCH_SECONDS = 10;
const POLL_MS = 1500;

export default function MatchmakingPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [secondsLeft, setSecondsLeft] = useState(SEARCH_SECONDS);
  const [message, setMessage] = useState<string | null>(null);
  const doneRef = useRef(false);
  const busyRef = useRef(false);

  useEffect(() => {
    const sessionId = getSessionId();
    const name = getPlayerName() || t('you');
    const startedAt = Date.now();
    void claimSession();

    const goToGame = (gameId: string) => {
      if (doneRef.current) return;
      doneRef.current = true;
      trackEvent('online_match_found', { wait_ms: Date.now() - startedAt }, { gameMode: 'online_quick' });
      setMessage(t('opponentFound'));
      setTimeout(() => navigate(`/multiplayer-game?gameId=${gameId}`, { replace: true }), 600);
    };

    const fallbackToComputer = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      trackEvent('online_match_fallback_ai', {}, { gameMode: 'quick_match' });
      if (countActiveLocalGames() >= MAX_ACTIVE_LOCAL_GAMES) {
        toast.error(t('maxActiveLocalGames', { max: MAX_ACTIVE_LOCAL_GAMES }));
        navigate('/', { replace: true });
        return;
      }
      setMessage(t('noOpponentFound'));
      const playerNames = [name, ...getRandomAiNames(1)];
      setTimeout(
        () => navigate('/game', { replace: true, state: { playerNames, aiPlayers: [1], localGameId: newLocalGameId() } }),
        900,
      );
    };

    const poll = async () => {
      if (doneRef.current || busyRef.current) return;
      busyRef.current = true;
      try {
        const res = await findOrJoinMatch(sessionId, name);
        if (doneRef.current) return;
        if (res.status === 'matched') goToGame(res.game_id);
        else if (res.status === 'error' && res.error === 'too_many_games') {
          doneRef.current = true;
          toast.error(t('maxActiveLocalGames', { max: 3 }));
          navigate('/', { replace: true });
        }
      } finally {
        busyRef.current = false;
      }
    };

    trackEvent('online_match_search', {}, { gameMode: 'online_quick' });
    void poll();
    const pollTimer = window.setInterval(() => void poll(), POLL_MS);
    const tick = window.setInterval(() => {
      const left = Math.max(0, SEARCH_SECONDS - Math.floor((Date.now() - startedAt) / 1000));
      setSecondsLeft(left);
      if (left === 0 && !doneRef.current) {
        window.clearInterval(pollTimer);
        window.clearInterval(tick);
        void leaveMatchmaking(sessionId).then(res => {
          if (res.status === 'matched') goToGame(res.game_id);
          else fallbackToComputer();
        });
      }
    }, 250);

    return () => {
      window.clearInterval(pollTimer);
      window.clearInterval(tick);
      if (!doneRef.current) {
        doneRef.current = true;
        void leaveMatchmaking(sessionId);
      }
    };
  }, [navigate, t]);

  const cancel = () => navigate('/', { replace: true });

  return (
    <div className="app-screen px-6 safe-top safe-bottom flex items-center justify-center">
      <motion.div
        className="max-w-sm w-full text-center space-y-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="relative mx-auto w-32 h-32 flex items-center justify-center">
          <motion.div
            className="absolute inset-0 rounded-full border-4 border-primary/30"
            animate={{ scale: [1, 1.25, 1], opacity: [0.6, 0, 0.6] }}
            transition={{ duration: 1.6, repeat: Infinity }}
          />
          <motion.span
            className="text-6xl"
            animate={{ rotate: message ? 0 : [0, 20, -20, 0] }}
            transition={{ duration: 1.2, repeat: message ? 0 : Infinity }}
          >
            🎲
          </motion.span>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-display font-bold text-foreground">
            {message ?? t('searchingOpponent')}
          </h1>
          {!message && (
            <>
              <p className="text-4xl font-display font-bold text-gold-gradient">{secondsLeft}</p>
              <p className="text-sm text-muted-foreground">{t('searchingHint')}</p>
            </>
          )}
        </div>

        {!message && (
          <motion.button
            onClick={cancel}
            className="w-full py-3 rounded-2xl bg-secondary text-secondary-foreground font-display font-bold"
            whileTap={{ scale: 0.97 }}
          >
            {t('matchmakingCancel')}
          </motion.button>
        )}
      </motion.div>
    </div>
  );
}
