import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getActiveGames,
  isGameExpired,
  getTimeRemaining,
  formatTimeRemaining,
  removeActiveGame,
  clearLocalActiveGame,
  countActiveLocalGames,
  newLocalGameId,
  MAX_ACTIVE_LOCAL_GAMES,
  setActiveGame,
  type ActiveGame,
} from '@/lib/active-game';
import { getRandomAiNames } from '@/lib/yatzy-ai';
import { getPlayerName, getSessionId } from '@/lib/session';
import { getLocalStats, type LocalStats } from '@/lib/local-stats';
import { supabase } from '@/integrations/supabase/client';
import { Play, Clock, Gamepad2, Trophy, Star, Percent, Dices, Flame, Globe, Settings, Users, Heart } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/i18n';
import { trackEvent } from '@/lib/analytics';
import { syncCountryRank, syncWorldLeader, countryToFlag, countryName, type RankInfo, type WorldLeader } from '@/lib/country-rank';
import { getLanguage, setLanguage, LANGUAGES, type Language } from '@/lib/profile';

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
  const { t, lang } = useTranslation();
  const [activeGames, setActiveGames] = useState<ActiveGame[]>(() => getActiveGames());
  const [statuses, setStatuses] = useState<Record<string, GameStatus>>({});
  const [showQuickMatch, setShowQuickMatch] = useState(false);
  const [stats, setStats] = useState<LocalStats>(() => getLocalStats());
  const [rankInfo, setRankInfo] = useState<RankInfo>({ country: null, world: null });
  const [worldLeader, setWorldLeader] = useState<WorldLeader | null>(null);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [showAdBubble, setShowAdBubble] = useState(false);
  const langPickerRef = useRef<HTMLDivElement>(null);

  // Sync country + world ranking whenever the games_played count changes.
  useEffect(() => {
    let cancelled = false;
    void syncCountryRank(stats.gamesPlayed).then(res => {
      if (!cancelled) setRankInfo(res);
    });
    void syncWorldLeader().then(res => {
      if (!cancelled) setWorldLeader(res);
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

  // Close language picker when tapping outside of it.
  useEffect(() => {
    if (!showLangPicker) return;
    const onPointerDown = (e: PointerEvent) => {
      if (langPickerRef.current && !langPickerRef.current.contains(e.target as Node)) {
        setShowLangPicker(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [showLangPicker]);

  // Show the optional-ad reminder bubble every 3rd app open.
  useEffect(() => {
    const KEY = 'mrbyatzy_app_opens';
    const count = (parseInt(localStorage.getItem(KEY) || '0', 10) || 0) + 1;
    localStorage.setItem(KEY, String(count));
    if (count % 3 === 0) {
      setShowAdBubble(true);
    }
  }, []);

  // Auto-dismiss the ad bubble after a few seconds.
  useEffect(() => {
    if (!showAdBubble) return;
    const timer = setTimeout(() => setShowAdBubble(false), 4000);
    return () => clearTimeout(timer);
  }, [showAdBubble]);


  // Sync server-side active multiplayer games into the local list so games
  // created while the app was closed (e.g. friend accepted an invite) show up.
  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      const sessionId = getSessionId();
      // Enforce the 48h limit server-side before listing: idle matches are
      // finished and excluded from statistics.
      await supabase.rpc('expire_stale_matches');
      if (cancelled) return;
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
          if (g.type === 'local') clearLocalActiveGame(g.gameId);
          else if (g.gameId) {
            const gid = g.gameId;
            removeActiveGame(gid);
            // Close it server-side too so it never lands in the statistics
            void supabase.rpc('expire_match', { p_game_id: gid });
          }
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
        supabase.from('games').select('id, status, current_player_index, created_at, updated_at').in('id', ids),
        supabase.from('game_players').select('game_id, session_id, player_index, player_name, last_active_at').in('game_id', ids),
      ]);
      if (cancelled) return;
      const next: Record<string, GameStatus> = {};
      let removed = false;
      let refreshed = false;
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

        // The 48h countdown mirrors the server's expiry rule: only real moves
        // on the game itself count — merely having the app open (heartbeat on
        // game_players.last_active_at) must never reset the clock.
        const ts = (v?: string | null) => (v ? new Date(v).getTime() : 0);
        const serverActivity = Math.max(ts(g.created_at), ts(g.updated_at));
        const local = mp.find(x => x.gameId === id);
        if (serverActivity > 0 && local && Math.abs(serverActivity - local.lastRollTime) > 60_000) {
          setActiveGame({
            type: 'multiplayer',
            gameId: id,
            timestamp: local.timestamp,
            opponentName: opponent?.player_name ?? local.opponentName,
            lastRollTime: Math.min(serverActivity, now),
          });
          refreshed = true;
        }

        next[id] = {
          myTurn: me ? me.player_index === g.current_player_index : false,
          opponentName: opponent?.player_name,
          opponentOnline: opponent ? (now - opponentActiveMs) < ONLINE_THRESHOLD_MS : false,
          finished: false,
        };
      }
      if (removed || refreshed) setActiveGames(getActiveGames());
      setStatuses(next);

    })();
    return () => { cancelled = true; };
  }, [activeGames]);

  const resumeGame = (game: ActiveGame) => {
    if (isGameExpired(game)) {
      if (game.type === 'local') clearLocalActiveGame(game.gameId);
      else if (game.gameId) {
        const gid = game.gameId;
        removeActiveGame(gid);
        void supabase.rpc('expire_match', { p_game_id: gid });
      }
      setActiveGames(getActiveGames());
      toast.error(t('matchExpired'));
      return;
    }

    if (game.type === 'local') {
      navigate('/game', { state: { localGameId: game.gameId } });
    } else if (game.type === 'multiplayer' && game.gameId) {
      navigate(`/multiplayer-game?gameId=${game.gameId}`);
    }
  };


  return (
    <div
      className="app-fixed-screen flex flex-col items-center px-6 py-3 safe-top safe-bottom relative overflow-x-hidden overflow-y-auto [&::-webkit-scrollbar]:hidden"
      style={{ WebkitOverflowScrolling: 'touch', overscrollBehaviorY: 'contain', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >

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
        className="relative z-10 flex flex-col items-center gap-4 sm:gap-8 w-full max-w-sm my-auto after:absolute after:top-[calc(100%+7rem)] after:left-0 after:w-px after:h-px after:content-['']"
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
            <motion.div className="space-y-1.5" variants={item} transition={{ duration: 0.45, ease: 'easeOut' }}>
              {[...activeGames].sort((a, b) => {
                // "Din tur"-spel överst
                const aMyTurn = a.type === 'local'
                  ? (a.currentPlayerIndex ?? 0) === 0
                  : !!(a.gameId && statuses[a.gameId]?.myTurn);
                const bMyTurn = b.type === 'local'
                  ? (b.currentPlayerIndex ?? 0) === 0
                  : !!(b.gameId && statuses[b.gameId]?.myTurn);
                if (aMyTurn === bMyTurn) return 0;
                return aMyTurn ? -1 : 1;
              }).map((game) => {
                const isLocal = game.type === 'local';
                const status = !isLocal && game.gameId ? statuses[game.gameId] : undefined;
                const opponent = status?.opponentName ?? game.opponentName;
                const localMyTurn = isLocal ? (game.currentPlayerIndex ?? 0) === 0 : undefined;
                const myTurn = isLocal ? localMyTurn === true : status?.myTurn === true;
                const opponentTurn = isLocal ? localMyTurn === false : status && status.myTurn === false;
                const waitingForStatus = !isLocal && !status;
                const timeLeft = formatTimeRemaining(getTimeRemaining(game));
                const key = game.gameId ?? 'local';
                return (
                  <motion.button
                    key={key}
                    onClick={() => resumeGame(game)}
                    className={`w-full px-3 py-2.5 rounded-xl transition-all flex items-center gap-2.5 text-left border-l-4 ${
                      myTurn
                        ? 'bg-gradient-to-r from-game-success to-game-success/90 text-white shadow-[0_2px_10px_hsl(142_72%_45%/0.25)] border-l-game-gold'
                        : opponentTurn || waitingForStatus
                          ? 'bg-secondary/70 text-foreground border border-border/60 border-l-game-info/80 hover:bg-secondary/85'
                          : 'bg-gradient-to-r from-game-success to-game-success/90 text-white shadow-[0_2px_10px_hsl(142_72%_45%/0.25)] border-l-game-gold'
                    }`}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                      myTurn ? 'bg-white/15' : 'bg-muted/50'
                    }`}>
                      <Play className={`w-4 h-4 ${myTurn ? '' : 'text-muted-foreground'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`font-display font-bold text-sm truncate inline-flex items-center gap-1.5 ${
                          myTurn ? 'text-white' : 'text-foreground'
                        }`}>
                          {!isLocal && status?.opponentOnline && (
                            <span
                              className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.9)]"
                              aria-label={t('onlineNow')}
                            />
                          )}
                          {isLocal ? (game.opponentName ?? t('resumeMatch')) : (opponent ?? t('resumeMatch'))}
                        </span>
                      </div>
                      <div className={`flex items-center gap-1 mt-px text-[10px] tabular-nums ${
                        myTurn ? 'text-white/70' : 'text-muted-foreground/80'
                      }`}>
                        <Clock className="w-3 h-3" />
                        <span className="truncate">{t('ongoingMatchRemaining', { time: timeLeft })}</span>
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      {myTurn && (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-game-gold text-background">
                          {t('yourTurnLabel')}
                        </span>
                      )}
                      {(opponentTurn || waitingForStatus) && opponent && (
                        <span className="text-[9px] font-medium uppercase tracking-wider px-2 py-1 rounded-full bg-muted/70 text-muted-foreground">
                          {t('waitingShort')}
                        </span>
                      )}
                    </div>
                  </motion.button>
                );
              })}
            </motion.div>
          )}


          {/* Main actions stacked */}
          <div className="flex flex-col gap-2.5">
            <motion.button
              onClick={() => setShowQuickMatch(true)}
              className="w-full py-3 sm:py-4 rounded-2xl bg-primary text-primary-foreground font-display font-bold text-base sm:text-lg shadow-[0_4px_16px_hsl(36_78%_55%/0.3)] active:shadow-[0_2px_8px_hsl(36_78%_55%/0.2)] transition-shadow flex items-center justify-center gap-2"
              whileTap={{ scale: 0.97 }}
              variants={item}
              transition={{ duration: 0.45, ease: 'easeOut' }}
            >
              🎲 <span className="truncate">{t('quickMatch')}</span>
            </motion.button>

            <motion.button
              onClick={() => navigate('/multiplayer')}
              className="w-full py-3 sm:py-4 rounded-2xl bg-gradient-to-r from-game-info to-game-info/80 text-white font-display font-bold text-base sm:text-lg shadow-[0_4px_16px_hsl(200_65%_50%/0.3)] active:shadow-[0_2px_8px_hsl(200_65%_50%/0.2)] transition-shadow flex items-center justify-center gap-2"
              whileTap={{ scale: 0.97 }}
              variants={item}
              transition={{ duration: 0.45, ease: 'easeOut' }}
            >
              🌐 <span className="truncate">{t('playWithFriends')}</span>
            </motion.button>
          </div>

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
                        if (countActiveLocalGames() >= MAX_ACTIVE_LOCAL_GAMES) {
                          toast.error(t('maxActiveLocalGames', { max: MAX_ACTIVE_LOCAL_GAMES }));
                          return;
                        }
                        trackEvent('quick_match_started', { opponents }, { gameMode: 'quick_match' });
                        navigate('/game', { state: { playerNames, aiPlayers, localGameId: newLocalGameId() } });
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

          {/* Premium round secondary actions */}
          <div className="relative w-full">
            <motion.div
              className="grid grid-cols-4 place-items-center gap-1 sm:gap-2 w-full"
              variants={item}
              transition={{ duration: 0.45, ease: 'easeOut' }}
            >
              <div className={`relative flex flex-col items-center gap-1.5 group transition-opacity duration-300 ${showAdBubble ? 'opacity-40' : 'opacity-100'}`} ref={langPickerRef}>
                <motion.button
                  onClick={() => setShowLangPicker(v => !v)}
                  className="w-[46px] h-[46px] sm:w-[50px] sm:h-[50px] rounded-full bg-secondary/40 border border-border/50 flex items-center justify-center shadow-md group-hover:bg-secondary/60 transition-all duration-300"
                  whileTap={{ scale: 0.92 }}
                  aria-label={t('selectLanguage')}
                >
                  <Globe className="w-4 h-4 sm:w-5 sm:h-5 text-primary/90" />
                </motion.button>
                <span className="text-[8px] font-medium tracking-wider text-primary/60 uppercase whitespace-nowrap inline-flex items-start h-5">{t('language')}</span>

                <AnimatePresence>
                  {showLangPicker && (
                    <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-44 max-h-48 overflow-y-auto rounded-2xl bg-popover border border-border/60 shadow-[0_8px_24px_hsl(var(--popover-foreground)/0.12)] z-50 py-1.5 [&::-webkit-scrollbar]:hidden"
                      style={{ WebkitOverflowScrolling: 'touch', overscrollBehaviorY: 'contain', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                    >
                      {LANGUAGES.map((l) => (
                        <button
                          key={l.code}
                          onClick={() => {
                            setLanguage(l.code as Language);
                            setShowLangPicker(false);
                          }}
                          className={`w-full px-3 py-2 flex items-center gap-2.5 text-sm transition-colors ${lang === l.code ? 'bg-primary/15 text-primary font-semibold' : 'text-popover-foreground hover:bg-secondary/60'}`}
                        >
                          <span className="text-base">{l.flag}</span>
                          <span className="flex-1 text-left">{l.label}</span>
                          {lang === l.code && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <motion.button
                onClick={() => navigate('/settings')}
                className={`flex flex-col items-center gap-1.5 group transition-opacity duration-300 ${showAdBubble ? 'opacity-40' : 'opacity-100'}`}
                whileTap={{ scale: 0.92 }}
                aria-label={t('goSettings')}
              >
                <div className="w-[46px] h-[46px] sm:w-[50px] sm:h-[50px] rounded-full bg-secondary/40 border border-border/50 flex items-center justify-center shadow-md group-hover:bg-secondary/60 transition-all duration-300">
                  <Settings className="w-4 h-4 sm:w-5 sm:h-5 text-primary/90" />
                </div>
                <span className="text-[8px] font-medium tracking-wider text-primary/60 uppercase whitespace-nowrap inline-flex items-start h-5">{t('settings')}</span>
              </motion.button>

              <motion.button
                onClick={() => navigate('/friends')}
                className={`flex flex-col items-center gap-1.5 group transition-opacity duration-300 ${showAdBubble ? 'opacity-40' : 'opacity-100'}`}
                whileTap={{ scale: 0.92 }}
                aria-label={t('friendsListTitle')}
              >
                <div className="w-[46px] h-[46px] sm:w-[50px] sm:h-[50px] rounded-full bg-secondary/40 border border-border/50 flex items-center justify-center shadow-md group-hover:bg-secondary/60 transition-all duration-300">
                  <Users className="w-4 h-4 sm:w-5 sm:h-5 text-primary/90" />
                </div>
                <span className="text-[8px] font-medium tracking-wider text-primary/60 uppercase whitespace-nowrap inline-flex items-start h-5">{t('friends')}</span>
              </motion.button>

              <div className="relative w-full flex flex-col items-center gap-1.5 group">
                <AnimatePresence>
                  {showAdBubble && (
                    <motion.div
                      initial={{ opacity: 0, y: 12, scale: 0.92 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.95 }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                      onClick={() => setShowAdBubble(false)}
                      className="absolute bottom-[calc(100%+6px)] right-0 z-50 w-[180px] px-3 py-2.5 rounded-2xl bg-popover/95 border border-primary/30 shadow-[0_8px_28px_rgba(0,0,0,0.35)] backdrop-blur-sm cursor-pointer"
                      aria-label={t('adBubbleText')}
                    >
                      <div className="flex items-center gap-2.5 text-left">
                        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center shadow-[0_0_12px_hsl(var(--primary)/0.25)]">
                          <Heart className="w-3.5 h-3.5 text-primary fill-primary/40" />
                        </div>
                        <p className="text-[10px] font-medium text-foreground leading-snug">
                          {t('adBubbleText')}
                        </p>
                      </div>
                      {/* Bubble tail pointing to the ad button */}
                      <div className="absolute -bottom-1.5 right-6 w-3 h-3 bg-popover/95 border-r border-b border-primary/30 rotate-45" />
                    </motion.div>
                  )}
                </AnimatePresence>

                <motion.button
                  onClick={handleOptionalAdClick}
                  disabled={adLoading}
                  className="flex flex-col items-center gap-1.5 group disabled:opacity-60"
                  whileTap={{ scale: 0.92 }}
                  aria-label={t('adButtonLabel')}
                >
                  <div className="relative">
                    {showAdBubble && (
                      <div className="absolute -inset-1 rounded-full border-2 border-primary/40 animate-pulse" />
                    )}
                    <div className={`w-[46px] h-[46px] sm:w-[50px] sm:h-[50px] rounded-full flex items-center justify-center shadow-md transition-all duration-300 ${showAdBubble ? 'bg-primary/20 border border-primary/60' : 'bg-secondary/40 border border-border/50 group-hover:bg-secondary/60'}`}>
                      <Play className={`w-4 h-4 sm:w-5 sm:h-5 transition-colors duration-300 ${showAdBubble ? 'text-primary' : 'text-primary/90'}`} />
                    </div>
                  </div>
                  <span className="text-[8px] font-medium tracking-wider text-primary/60 uppercase text-center leading-tight inline-flex flex-col items-center justify-start h-5">{t('adButtonShort')}</span>
                </motion.button>
              </div>
            </motion.div>
          </div>


        </div>

        <motion.div
          className="relative w-full space-y-2.5"
          variants={item}
          transition={{ duration: 0.45, ease: 'easeOut' }}
        >
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: t('statGames'), value: stats.gamesPlayed, icon: Gamepad2 },
              { label: t('statWins'), value: stats.wins, icon: Trophy },
              { label: t('statHigh'), value: stats.highScore, icon: Star },
            ].map((stat) => (
              <div
                key={stat.label}
                className="flex flex-col items-center gap-0.5 py-2 sm:py-2.5 px-1.5 rounded-2xl bg-secondary/60 border border-border/50"
              >
                <stat.icon className="w-3 h-3 text-primary/70" />
                <span className="text-lg sm:text-xl font-display font-black text-foreground tabular-nums leading-none">
                  {stat.value}
                </span>
                <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider truncate max-w-full">
                  {stat.label}
                </span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2">
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
                className="flex flex-col items-center gap-0.5 py-2 sm:py-2.5 px-1.5 rounded-2xl bg-secondary/60 border border-border/50"
              >
                <stat.icon className="w-3 h-3 text-primary/70" />
                <span className="text-lg sm:text-xl font-display font-black text-foreground tabular-nums leading-none">
                  {stat.value}
                </span>
                <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider truncate max-w-full">
                  {stat.label}
                </span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col items-center justify-center gap-0.5 py-2.5 px-2 rounded-2xl bg-secondary/60 border border-border/50 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/8 to-transparent pointer-events-none" />
              <div className="flex items-center gap-1.5 relative z-10">
                <span className="text-xl leading-none" aria-hidden>{rankInfo.country ? countryToFlag(rankInfo.country.country) : '🏳️'}</span>
                <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider text-center">
                  {rankInfo.country
                    ? t('countryRankLabelFull', { country: countryName(rankInfo.country.country, getLanguage()) })
                    : t('countryRankLabel')}
                </span>
              </div>
              <div className="relative z-10 flex items-baseline justify-center mt-0.5">
                <span className="text-base sm:text-lg font-display font-medium text-muted-foreground/50 mr-0.5 select-none leading-none">#</span>
                <span className="text-xl sm:text-2xl font-display font-black tracking-tighter tabular-nums leading-none bg-clip-text text-transparent bg-gradient-to-br from-game-gold-light via-primary to-game-gold-dark drop-shadow-[0_0_12px_hsl(var(--primary)/0.35)]">
                  {rankInfo.country ? rankInfo.country.rank : '–'}
                </span>
              </div>
              <div className="h-0.5 w-8 rounded-full bg-gradient-to-r from-transparent via-primary/50 to-transparent relative z-10" />
            </div>
            <div className="flex flex-col items-center justify-center gap-0.5 py-2.5 px-2 rounded-2xl bg-secondary/60 border border-border/50 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/8 to-transparent pointer-events-none" />
              <div className="flex items-center gap-1.5 relative z-10">
                <span className="text-xl leading-none" aria-hidden>🌍</span>
                <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider text-center">
                  {t('worldRankLabelFull')}
                </span>
              </div>
              <div className="relative z-10 flex items-baseline justify-center mt-0.5">
                <span className="text-base sm:text-lg font-display font-medium text-muted-foreground/50 mr-0.5 select-none leading-none">#</span>
                <span className="text-xl sm:text-2xl font-display font-black tracking-tighter tabular-nums leading-none bg-clip-text text-transparent bg-gradient-to-br from-game-info-light via-game-info to-game-info-dark drop-shadow-[0_0_12px_hsl(var(--game-info)/0.35)]">
                  {rankInfo.world ? rankInfo.world.rank : '–'}
                </span>
              </div>
              <div className="h-0.5 w-8 rounded-full bg-gradient-to-r from-transparent via-game-info/50 to-transparent relative z-10" />
            </div>
          </div>

          <div className="absolute top-[calc(100%+0.5rem)] left-0 right-0 grid grid-cols-1 gap-2">
            <div className="flex flex-col items-center justify-center gap-0.5 py-2 px-2 rounded-2xl bg-secondary/60 border border-border/50 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/8 to-transparent pointer-events-none" />
              <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider text-center relative z-10">
                {t('worldLeaderLabel')}
              </span>
              <span className="text-2xl sm:text-3xl leading-none relative z-10" aria-hidden>
                {worldLeader ? countryToFlag(worldLeader.country) : '🏳️'}
              </span>
              {worldLeader && (
                <span className="text-[9px] font-medium text-muted-foreground relative z-10 text-center leading-tight">
                  {countryName(worldLeader.country, getLanguage())}
                </span>
              )}
            </div>
          </div>

        </motion.div>
      </motion.div>
    </div>
  );
}
