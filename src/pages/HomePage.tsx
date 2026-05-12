import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { getActiveGame, isGameExpired, getTimeRemaining, formatTimeRemaining, clearActiveGame } from '@/lib/active-game';
import { getRandomAiNames } from '@/lib/yatzy-ai';
import { getPlayerName } from '@/lib/session';
import { getLocalStats, type LocalStats } from '@/lib/local-stats';
import { Play, Clock, Gamepad2, Trophy, Star, Percent, Dices, Flame } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/i18n';
import { trackEvent } from '@/lib/analytics';

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
};

export default function HomePage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [activeGame, setActiveGameState] = useState(() => getActiveGame());
  const [timeLeft, setTimeLeft] = useState('');
  const [showQuickMatch, setShowQuickMatch] = useState(false);
  const [stats, setStats] = useState<LocalStats>(() => getLocalStats());

  useEffect(() => {
    const onFocus = () => setStats(getLocalStats());
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  useEffect(() => {
    if (!activeGame) return;

    const update = () => {
      const game = getActiveGame();
      if (!game) {
        setActiveGameState(null);
        return;
      }
      if (isGameExpired(game)) {
        clearActiveGame();
        setActiveGameState(null);
        toast.error(t('matchExpired'));
        return;
      }
      setTimeLeft(formatTimeRemaining(getTimeRemaining(game)));
    };

    update();
    const interval = setInterval(update, 30_000);
    return () => clearInterval(interval);
  }, [activeGame, t]);

  const resumeGame = () => {
    if (!activeGame) return;
    if (isGameExpired(activeGame)) {
      clearActiveGame();
      setActiveGameState(null);
      toast.error(t('matchExpired'));
      return;
    }
    if (activeGame.type === 'local') {
      navigate('/game');
    } else if (activeGame.type === 'multiplayer' && activeGame.gameId) {
      navigate(`/multiplayer-game?gameId=${activeGame.gameId}`);
    }
  };

  return (
    <div className="app-fixed-screen flex flex-col items-center justify-center px-6 py-3 safe-top safe-bottom relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-primary/6 blur-[120px]" />
      </div>

      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          opacity: 0.035,
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'%3E%3Crect x='10' y='10' width='40' height='40' rx='8' fill='none' stroke='white' stroke-width='1.5'/%3E%3Ccircle cx='22' cy='22' r='3' fill='white'/%3E%3Ccircle cx='38' cy='22' r='3' fill='white'/%3E%3Ccircle cx='22' cy='38' r='3' fill='white'/%3E%3Ccircle cx='38' cy='38' r='3' fill='white'/%3E%3Ccircle cx='30' cy='30' r='3' fill='white'/%3E%3C/svg%3E")`,
          backgroundSize: '60px 60px',
        }}
      />

      <motion.div
        className="relative z-10 flex flex-col items-center gap-4 sm:gap-8 w-full max-w-sm"
        variants={{ show: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } } }}
        initial="hidden"
        animate="show"
      >
        <motion.div className="text-center space-y-1 sm:space-y-2" variants={item} transition={{ duration: 0.45, ease: 'easeOut' }}>
          <motion.div
            className="inline-flex items-center justify-center w-14 h-14 sm:w-20 sm:h-20 rounded-2xl bg-primary/10 border border-primary/20 mb-2 sm:mb-4"
            animate={{ rotate: [0, 0, 6, -4, 0], scale: [1, 1, 1.06, 1.02, 1] }}
            transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 3, ease: 'easeInOut' }}
          >
            <span className="text-3xl sm:text-4xl">🎲</span>
          </motion.div>
          <h1
            className="text-4xl sm:text-5xl font-display font-black text-gold-gradient"
            style={{ textShadow: '0 0 30px hsl(36 78% 55% / 0.15), 0 0 60px hsl(36 78% 55% / 0.08)' }}
          >
            {t('appName')}
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm px-2">
            {t('tagline')}
          </p>
        </motion.div>

        <div className="w-full space-y-2 sm:space-y-3">
          {activeGame && (
            <motion.div variants={item} transition={{ duration: 0.45, ease: 'easeOut' }}>
              <motion.button
                onClick={resumeGame}
                className="w-full py-3 sm:py-4 rounded-2xl bg-game-success text-white font-display font-bold text-base sm:text-lg shadow-lg flex items-center justify-center gap-2 active:shadow-md transition-shadow"
                whileTap={{ scale: 0.97 }}
              >
                <Play className="w-5 h-5" />
                <span className="truncate">{t('resumeMatch')}</span>
              </motion.button>
              {timeLeft && (
                <div className="flex items-center justify-center gap-1.5 mt-2">
                  <Clock className="w-3 h-3 text-muted-foreground/60" />
                  <span className="text-[11px] text-muted-foreground/60 tabular-nums truncate">
                    {t('ongoingMatchRemaining', { time: timeLeft })}
                  </span>
                </div>
              )}
            </motion.div>
          )}
          <motion.button
            onClick={() => setShowQuickMatch(true)}
            className="w-full py-3 sm:py-4 rounded-2xl bg-primary text-primary-foreground font-display font-bold text-base sm:text-lg shadow-[0_4px_16px_hsl(36_78%_55%/0.3)] active:shadow-[0_2px_8px_hsl(36_78%_55%/0.2)] transition-shadow flex items-center justify-center gap-2"
            whileTap={{ scale: 0.97 }}
            variants={item}
            transition={{ duration: 0.45, ease: 'easeOut' }}
          >
            🎲 <span className="truncate">{t('quickMatch')}</span>
          </motion.button>

          <AnimatePresence>
            {showQuickMatch && (
              <motion.div
                className="space-y-3"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
              >
                <p className="text-center text-sm text-muted-foreground font-medium">
                  {t('selectPlayerCount')}
                </p>
                <div className="flex gap-2">
                  {[1, 2, 3].map(opponents => (
                    <motion.button
                      key={opponents}
                      onClick={() => {
                        const humanName = getPlayerName() || t('you');
                        const aiNames = getRandomAiNames(opponents);
                        const playerNames = [humanName, ...aiNames];
                        const aiPlayers = Array.from({ length: opponents }, (_, i) => i + 1);
                        trackEvent('quick_match_started', { opponents }, { gameMode: 'quick_match' });
                        navigate('/game', { state: { playerNames, aiPlayers } });
                      }}
                      className="flex-1 py-3 px-2 rounded-xl bg-secondary text-secondary-foreground font-display font-bold text-xs sm:text-sm transition-all hover:bg-secondary/80 flex items-center justify-center text-center leading-tight"
                      whileTap={{ scale: 0.95 }}
                    >
                      <span>{opponents} {opponents === 1 ? t('opponent') : t('opponents')}</span>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button
            onClick={() => navigate('/multiplayer')}
            className="w-full py-3 sm:py-4 rounded-2xl bg-gradient-to-r from-game-info to-game-info/80 text-white font-display font-bold text-base sm:text-lg shadow-[0_4px_16px_hsl(200_65%_50%/0.3)] active:shadow-[0_2px_8px_hsl(200_65%_50%/0.2)] transition-shadow"
            whileTap={{ scale: 0.97 }}
            variants={item}
            transition={{ duration: 0.45, ease: 'easeOut' }}
          >
            🌐 <span className="truncate">{t('playWithFriends')}</span>
          </motion.button>

          <motion.button
            onClick={() => navigate('/friend-stats')}
            className="w-full py-2 text-[12px] font-medium text-muted-foreground/80 active:text-foreground transition-colors"
            whileTap={{ scale: 0.97 }}
            variants={item}
            transition={{ duration: 0.45, ease: 'easeOut' }}
          >
            {t('friendStats')} →
          </motion.button>
        </div>

        <motion.div
          className="w-full space-y-2.5"
          variants={item}
          transition={{ duration: 0.45, ease: 'easeOut' }}
        >
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { label: t('statGames'), value: stats.gamesPlayed, icon: Gamepad2 },
              { label: t('statWins'), value: stats.wins, icon: Trophy },
              { label: t('statHigh'), value: stats.highScore, icon: Star },
            ].map((stat) => (
              <div
                key={stat.label}
                className="flex flex-col items-center gap-1 py-2.5 sm:py-3.5 px-2 rounded-2xl bg-secondary/60 border border-border/50"
              >
                <stat.icon className="w-3.5 h-3.5 text-primary/70" />
                <span className="text-xl sm:text-2xl font-display font-black text-foreground tabular-nums leading-none">
                  {stat.value}
                </span>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider truncate max-w-full">
                  {stat.label}
                </span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            {[
              {
                label: t('statWinrate'),
                value: stats.gamesPlayed > 0
                  ? `${Math.round((stats.wins / stats.gamesPlayed) * 100)}%`
                  : '—',
                icon: Percent,
              },
              { label: t('statYatzy'), value: stats.yatzyCount, icon: Dices },
              {
                label: t('statStreak'),
                value: `${stats.currentStreak}/${stats.bestStreak}`,
                icon: Flame,
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="flex flex-col items-center gap-1 py-2.5 sm:py-3.5 px-2 rounded-2xl bg-secondary/60 border border-border/50"
              >
                <stat.icon className="w-3.5 h-3.5 text-primary/70" />
                <span className="text-xl sm:text-2xl font-display font-black text-foreground tabular-nums leading-none">
                  {stat.value}
                </span>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider truncate max-w-full">
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          className="w-full space-y-3"
          variants={item}
          transition={{ duration: 0.45, ease: 'easeOut' }}
        >
          <motion.button
            onClick={() => navigate('/settings')}
            className="w-full py-3 sm:py-4 rounded-2xl bg-secondary text-secondary-foreground font-display font-bold text-base sm:text-lg shadow-[0_4px_16px_hsl(195_38%_20%/0.3)] active:shadow-[0_2px_8px_hsl(195_38%_20%/0.2)] transition-shadow flex items-center justify-center gap-2"
            whileTap={{ scale: 0.97 }}
          >
            ⚙️ <span className="truncate">{t('goSettings')}</span>
          </motion.button>
        </motion.div>
      </motion.div>
    </div>
  );
}
