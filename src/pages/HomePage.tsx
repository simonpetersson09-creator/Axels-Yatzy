import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getActiveGames,
  isGameExpired,
  getTimeRemaining,
  formatTimeRemaining,
  removeActiveGame,
  clearLocalActiveGame,
  setActiveGame,
  type ActiveGame,
} from '@/lib/active-game';
import { getRandomAiNames } from '@/lib/yatzy-ai';
import { getPlayerName, getSessionId } from '@/lib/session';
import { getLocalStats, type LocalStats } from '@/lib/local-stats';
import { supabase } from '@/integrations/supabase/client';
import { Play, Clock, Gamepad2, Trophy, Star, Percent, Dices, Flame } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/i18n';
import { trackEvent } from '@/lib/analytics';
import { syncCountryRank, countryToFlag, countryName, type RankInfo } from '@/lib/country-rank';
import { getLanguage } from '@/lib/profile';

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
};

interface GameStatus {
  myTurn?: boolean;
  opponentName?: string;
  opponentOnline?: boolean;
  finished?: boolean;
}

const ONLINE_THRESHOLD_MS = 90_000; // 90s

export default function HomePage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [activeGames, setActiveGames] = useState<ActiveGame[]>(() => getActiveGames());
  const [statuses, setStatuses] = useState<Record<string, GameStatus>>({});
  const [showQuickMatch, setShowQuickMatch] = useState(false);
  const [stats, setStats] = useState<LocalStats>(() => getLocalStats());
  const [rankInfo, setRankInfo] = useState<RankInfo>({ country: null, world: null });

  // Sync country + world ranking whenever the games_played count changes.
  useEffect(() => {
    let cancelled = false;
    void syncCountryRank(stats.gamesPlayed).then(res => {
      if (!cancelled) setRankInfo(res);
    });
    return () => { cancelled = true; };
  }, [stats.gamesPlayed]);

  useEffect(() => {
    const onFocus = () => {
      setStats(getLocalStats());
      setActiveGames(getActiveGames());
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  // Sync server-side active multiplayer games into the local list so games
  // created while the app was closed (e.g. friend accepted an invite) show up.
  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      const sessionId = getSessionId();
      const { data, error } = await supabase
        .from('game_players')
        .select('game_id, player_name, session_id, games!inner(id, status)')
        .eq('session_id', sessionId)
        .in('games.status', ['waiting', 'playing']);
      if (cancelled || error || !data) return;
      const serverGameIds = new Set<string>();
      // Fetch player counts/opponent names in one round-trip
      const gameIds = data.map((r: { game_id: string }) => r.game_id);
      const opponents: Record<string, string> = {};
      const playerCounts: Record<string, number> = {};
      if (gameIds.length > 0) {
        const { data: gamePlayers } = await supabase
          .from('game_players')
          .select('game_id, player_name, session_id')
          .in('game_id', gameIds);
        for (const p of gamePlayers ?? []) {
          playerCounts[p.game_id] = (playerCounts[p.game_id] ?? 0) + 1;
          if (p.session_id !== sessionId) opponents[p.game_id] = p.player_name;
        }
      }
      let changed = false;
      const existing = new Set(getActiveGames().filter(g => g.gameId).map(g => g.gameId!));
      for (const row of data) {
        const gid = row.game_id as string;
        const gameStatus = Array.isArray(row.games) ? row.games[0]?.status : row.games?.status;
        const isSoloWaitingRoom = gameStatus === 'waiting' && (playerCounts[gid] ?? 0) < 2;
        if (isSoloWaitingRoom) {
          if (existing.has(gid)) {
            removeActiveGame(gid);
            changed = true;
          }
          continue;
        }
        serverGameIds.add(gid);
        if (!existing.has(gid)) {
          setActiveGame({
            type: 'multiplayer',
            gameId: gid,
            timestamp: Date.now(),
            opponentName: opponents[gid],
          });
          changed = true;
        }
      }
      if (changed && !cancelled) setActiveGames(getActiveGames());
    };
    void sync();
    return () => { cancelled = true; };
  }, []);


  // Expiry sweep + ticking time labels
  useEffect(() => {
    if (activeGames.length === 0) return;
    const tick = () => {
      const fresh = getActiveGames();
      let changed = fresh.length !== activeGames.length;
      for (const g of fresh) {
        if (isGameExpired(g)) {
          if (g.type === 'local') clearLocalActiveGame();
          else if (g.gameId) removeActiveGame(g.gameId);
          changed = true;
          toast.error(t('matchExpired'));
        }
      }
      if (changed) setActiveGames(getActiveGames());
      else setActiveGames([...fresh]); // refresh references so time labels recompute
    };
    const interval = setInterval(tick, 30_000);
    return () => clearInterval(interval);
  }, [activeGames.length, t]);

  // Fetch fresh server status for each multiplayer entry: whose turn, finished, opponent name.
  useEffect(() => {
    const mp = activeGames.filter(g => g.type === 'multiplayer' && g.gameId);
    if (mp.length === 0) return;
    let cancelled = false;
    (async () => {
      const sessionId = getSessionId();
      const ids = mp.map(g => g.gameId!) as string[];
      const [{ data: games }, { data: players }] = await Promise.all([
        supabase.from('games').select('id, status, current_player_index').in('id', ids),
        supabase.from('game_players').select('game_id, session_id, player_index, player_name, last_active_at').in('game_id', ids),
      ]);
      if (cancelled) return;
      const next: Record<string, GameStatus> = {};
      let removed = false;
      const now = Date.now();
      for (const id of ids) {
        const g = games?.find(x => x.id === id);
        if (!g) {
          // Game no longer exists in DB (deleted/cleaned) — prune from local list
          removeActiveGame(id);
          removed = true;
          continue;
        }
        if (g.status === 'finished') {
          removeActiveGame(id);
          removed = true;
          continue;
        }
        const me = players?.find(p => p.game_id === id && p.session_id === sessionId);
        const opponent = players?.find(p => p.game_id === id && p.session_id !== sessionId);
        const opponentActiveMs = opponent?.last_active_at ? new Date(opponent.last_active_at).getTime() : 0;
        next[id] = {
          myTurn: me ? me.player_index === g.current_player_index : false,
          opponentName: opponent?.player_name,
          opponentOnline: opponent ? (now - opponentActiveMs) < ONLINE_THRESHOLD_MS : false,
          finished: false,
        };
      }
      if (removed) setActiveGames(getActiveGames());
      setStatuses(next);
    })();
    return () => { cancelled = true; };
  }, [activeGames]);

  const resumeGame = (game: ActiveGame) => {
    if (isGameExpired(game)) {
      if (game.type === 'local') clearLocalActiveGame();
      else if (game.gameId) removeActiveGame(game.gameId);
      setActiveGames(getActiveGames());
      toast.error(t('matchExpired'));
      return;
    }
    if (game.type === 'local') {
      navigate('/game');
    } else if (game.type === 'multiplayer' && game.gameId) {
      navigate(`/multiplayer-game?gameId=${game.gameId}`);
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
          {activeGames.length > 0 && (
            <motion.div className="space-y-2" variants={item} transition={{ duration: 0.45, ease: 'easeOut' }}>
              {[...activeGames].sort((a, b) => {
                // "Din tur"-spel överst
                const aTurn = !!(a.gameId && statuses[a.gameId]?.myTurn);
                const bTurn = !!(b.gameId && statuses[b.gameId]?.myTurn);
                if (aTurn === bTurn) return 0;
                return aTurn ? -1 : 1;
              }).map((game) => {
                const isLocal = game.type === 'local';
                const status = !isLocal && game.gameId ? statuses[game.gameId] : undefined;
                const opponent = status?.opponentName ?? game.opponentName;
                const myTurn = status?.myTurn === true;
                const opponentTurn = !isLocal && status && status.myTurn === false;
                const timeLeft = formatTimeRemaining(getTimeRemaining(game));
                const key = isLocal ? 'local' : game.gameId!;
                return (
                  <motion.button
                    key={key}
                    onClick={() => resumeGame(game)}
                    className={`w-full px-4 py-3 rounded-2xl shadow-lg active:shadow-md transition-shadow flex items-center gap-3 text-left ${
                      myTurn
                        ? 'bg-game-success/95 text-white ring-2 ring-game-gold/60'
                        : opponentTurn
                          ? 'bg-secondary/80 text-foreground'
                          : 'bg-game-success/95 text-white'
                    }`}
                    whileTap={{ scale: 0.97 }}
                    animate={myTurn ? { boxShadow: ['0 4px 16px hsl(36 78% 55% / 0.20)', '0 4px 24px hsl(36 78% 55% / 0.50)', '0 4px 16px hsl(36 78% 55% / 0.20)'] } : undefined}
                    transition={myTurn ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } : undefined}
                  >
                    <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
                      myTurn ? 'bg-white/15' : opponentTurn ? 'bg-muted/60' : 'bg-white/15'
                    }`}>
                      <Play className={`w-5 h-5 ${opponentTurn ? 'text-muted-foreground' : ''}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-display font-bold text-sm sm:text-base truncate inline-flex items-center gap-1.5">
                          {!isLocal && status?.opponentOnline && (
                            <motion.span
                              className="inline-block w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]"
                              aria-label={t('onlineNow')}
                              animate={{ opacity: [1, 0.55, 1] }}
                              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                            />
                          )}
                          {isLocal ? t('resumeMatch') : (opponent ?? t('resumeMatch'))}
                        </span>
                        {myTurn && (
                          <motion.span
                            className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-game-gold text-background"
                            animate={{ scale: [1, 1.08, 1] }}
                            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                          >
                            {t('yourTurnLabel')}
                          </motion.span>
                        )}
                        {opponentTurn && opponent && (
                          <span className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-muted/60 text-muted-foreground">
                            {t('waitingForOpponent', { name: opponent })}
                          </span>
                        )}
                      </div>
                      <div className={`flex items-center gap-1 mt-0.5 text-[11px] tabular-nums ${
                        opponentTurn ? 'text-muted-foreground' : 'text-white/75'
                      }`}>
                        <Clock className="w-3 h-3" />
                        <span className="truncate">{t('ongoingMatchRemaining', { time: timeLeft })}</span>
                      </div>
                    </div>
                  </motion.button>
                );
              })}
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

          {(rankInfo.country || rankInfo.world) && (
            <div className="grid grid-cols-2 gap-2">
              {rankInfo.country && (
                <div className="flex flex-col items-center justify-center gap-1 py-3 px-3 rounded-2xl bg-secondary/60 border border-border/50 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/8 to-transparent pointer-events-none" />
                  <div className="flex items-center gap-2 relative z-10">
                    <span className="text-2xl leading-none" aria-hidden>{countryToFlag(rankInfo.country.country)}</span>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center">
                      {t('countryRankLabelFull', { country: countryName(rankInfo.country.country, getLanguage()) })}
                    </span>
                  </div>
                  <div className="font-display font-black text-2xl text-primary relative z-10 tabular-nums leading-none">
                    #{rankInfo.country.rank}
                  </div>
                </div>
              )}
              {rankInfo.world && (
                <div className="flex flex-col items-center justify-center gap-1 py-3 px-3 rounded-2xl bg-secondary/60 border border-border/50 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/8 to-transparent pointer-events-none" />
                  <div className="flex items-center gap-2 relative z-10">
                    <span className="text-2xl leading-none" aria-hidden>🌍</span>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center">
                      {t('worldRankLabelFull')}
                    </span>
                  </div>
                  <div className="font-display font-black text-2xl text-primary relative z-10 tabular-nums leading-none">
                    #{rankInfo.world.rank}
                  </div>
                </div>
              )}
            </div>
          )}
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
