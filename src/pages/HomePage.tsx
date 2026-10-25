import { onboardingCopy, quickHintPending, markQuickHintDone } from '@/lib/onboarding-copy';
import { BarChart3, ChevronRight } from 'lucide-react';
import mrBDie from '@/assets/mr-b-die.png';
import { Button } from '@/components/ui/button';
import { useWaitingRoomCount } from '@/hooks/useWaitingRoomCount';
import { WaitingRoomChoiceDialog } from '@/components/WaitingRoomChoiceDialog';
import { useState, useEffect, useRef, useSyncExternalStore } from 'react';
import { GoldInviteCard } from '@/components/GoldInviteCard';
import { DiceTierCard } from '@/components/DiceTierCard';
import { SentInvitesCards } from '@/components/SentInvitesCards';
import { cancelLobby } from '@/lib/friend-requests';
import { FriendRequestNotice } from '@/components/FriendRequestNotice';
import { HofRankNotice } from '@/components/HofRankNotice';
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
import { getPlayerName, getSessionId, getAnonNumber } from '@/lib/session';
import { getLocalStats, type LocalStats } from '@/lib/local-stats';
import { supabase } from '@/integrations/supabase/client';
import { Play, Clock, Gamepad2, Trophy, Star, Percent, Dices, Flame, Globe, Settings, Users, Heart, ChevronDown } from 'lucide-react';
import { getCachedHofRank, subscribeHofRank, syncMyHofRank } from '@/lib/hall-of-fame';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/i18n';
import { trackEvent } from '@/lib/analytics';
import { syncCountryRank, getCachedRankInfo, countryToFlag, countryName, type RankInfo } from '@/lib/country-rank';
import { getLanguage, setLanguage, LANGUAGES, subscribeProfileChanges, type Language } from '@/lib/profile';
import { isAdMobAvailable, preloadRewarded, subscribeRewardedState, getRewardedState, showAppOpenAd, preloadAppOpenAd } from '@/lib/admob';
import { optionalAdPair } from '@/lib/rewarded-pair';
import { OptionalAdsDialog } from '@/components/OptionalAdsDialog';
import { QuickMatchSearch } from '@/components/multiplayer/QuickMatchSearch';
import RateAppPrompt from '@/components/RateAppPrompt';
import NotificationAskPrompt from '@/components/NotificationAskPrompt';
import { getHomePrompt } from '@/lib/home-prompt';
import { shouldAskForNotifications, markNotificationsAsked } from '@/lib/notif-ask';
import { getPushPermissionState, requestPushPermission } from '@/lib/notifications';
import OnlineNewsPrompt, { shouldShowOnlineNews, markOnlineNewsSeen } from '@/components/OnlineNewsPrompt';
import ServerNewsPrompt, { shouldShowServerNews, markServerNewsSeen } from '@/components/ServerNewsPrompt';
import AndroidNewsPrompt, { shouldShowAndroidNews, markAndroidNewsSeen } from '@/components/AndroidNewsPrompt';
import { shouldShowDailyStartupAd, markDailyStartupAdShown } from '@/components/DailyAdPrompt';

/** Module-level: startup ad is only considered once per app launch. */
let startupAdChecked = false;
/** Module-level so it survives HomePage remounts while the app is in background. */
let backgroundedAt = 0;
const RESUME_AD_MIN_AWAY_MS = 60_000;
/** Set when the player was away ≥ 60 s but resumed outside the start screen. */
let resumeAdPending = false;
let resumeWatcherInstalled = false;
const onStartScreen = () => window.location.pathname === '/' && document.visibilityState === 'visible';
async function tryShowResumeAd() {
  if (!resumeAdPending || !onStartScreen()) return;
  resumeAdPending = false;
  if (await showAppOpenAd(onStartScreen)) trackEvent('resume_ad');
}
/** Installed once and never removed, so leaving the app mid-match is also counted. */
function installResumeAdWatcher() {
  if (resumeWatcherInstalled) return;
  resumeWatcherInstalled = true;
  void (async () => {
    const { App } = await import('@capacitor/app');
    await App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) { backgroundedAt = Date.now(); void preloadAppOpenAd(); return; }
      const away = backgroundedAt ? Date.now() - backgroundedAt : 0;
      backgroundedAt = 0;
      if (away < RESUME_AD_MIN_AWAY_MS) return;
      resumeAdPending = true;
      void tryShowResumeAd();
    });
  })();
}
import { shouldShowRatePrompt, snoozeRatePrompt, completeRatePrompt, requestAppReview } from '@/lib/rate-app';

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
};

interface OpenLobby { gameId: string; code: string; createdAt: string }

interface GameStatus {
  myTurn?: boolean;
  opponentName?: string;
  opponentOnline?: boolean;
  finished?: boolean;
}

const ONLINE_THRESHOLD_MS = 90_000; // 90s

/** Annonsintegrationen är aktiv – knappen är upplåst. */
const AD_BUTTON_LOCKED = false;

export default function HomePage() {
  const navigate = useNavigate();
  const { count: waitingCount, seated: waitingSeated, checking: waitingChecking } = useWaitingRoomCount();
  const [waitingEntryOpen, setWaitingEntryOpen] = useState(false);
  const { t, lang } = useTranslation();
  const [activeGames, setActiveGames] = useState<ActiveGame[]>(() => getActiveGames());
  const [openLobbies, setOpenLobbies] = useState<OpenLobby[]>([]);
  const [statuses, setStatuses] = useState<Record<string, GameStatus>>({});
  const [quickHint, setQuickHint] = useState(() => quickHintPending());
  const [showQuickMatch, setShowQuickMatch] = useState(
    () => !!(window.history.state?.usr as { openQuickMatch?: boolean } | undefined)?.openQuickMatch,
  );
  const [stats, setStats] = useState<LocalStats>(() => getLocalStats());
  // "Dina siffror – all time": första raden (spelade/vinster/rekord) syns alltid,
  // resten är infällt bakom rubriken tills spelaren trycker på den.
  const [statsExpanded, setStatsExpanded] = useState(false);
  const [rankInfo, setRankInfo] = useState<RankInfo>(getCachedRankInfo);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [showAdBubble, setShowAdBubble] = useState(false);
  const [adLoading, setAdLoading] = useState(false);
  const [showAdsConsent, setShowAdsConsent] = useState(false);
  // Bumps whenever any profile field (country, name, avatar) changes, so
  // rank sync re-runs even when the language itself didn't change.
  const [profileVersion, setProfileVersion] = useState(0);
  const [onlineSearch, setOnlineSearch] = useState<null | { humanName: string; playerNames: string[]; aiPlayers: number[] }>(null);
  useEffect(() => subscribeProfileChanges(() => setProfileVersion(v => v + 1)), []);
  const adInFlightRef = useRef(false);
  const langPickerRef = useRef<HTMLDivElement>(null);
  const [showRatePrompt, setShowRatePrompt] = useState(false);
  const [showOnlineNews, setShowOnlineNews] = useState(false);

  // One-time announcement of online quick match for existing players.
  useEffect(() => {
    if (!shouldShowOnlineNews(stats.gamesPlayed)) return;
    const timer = setTimeout(() => setShowOnlineNews(true), 900);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeOnlineNews = (play: boolean) => {
    markOnlineNewsSeen();
    setShowOnlineNews(false);
    trackEvent(play ? 'online_news_play' : 'online_news_dismiss');
    if (play) setShowQuickMatch(true);
  };

  // One-time box: server upgraded + apology. Shown before other news boxes.
  const [showServerNews, setShowServerNews] = useState(() => shouldShowServerNews(stats.gamesPlayed));
  const closeServerNews = () => {
    markServerNewsSeen();
    setShowServerNews(false);
  };

  // One-time box: the app is now available on Android (Google Play).
  const [showAndroidNews, setShowAndroidNews] = useState(false);
  useEffect(() => {
    if (!shouldShowAndroidNews(stats.gamesPlayed)) return;
    const timer = setTimeout(() => setShowAndroidNews(true), 1200);
    return () => clearTimeout(timer);
  }, [stats.gamesPlayed]);
  const closeAndroidNews = () => {
    markAndroidNewsSeen();
    setShowAndroidNews(false);
  };

  // Ask for a rating once the player has finished 5 matches.
  useEffect(() => {
    if (showRatePrompt) return;
    if (shouldShowRatePrompt(stats.gamesPlayed)) {
      const timer = setTimeout(() => setShowRatePrompt(true), 700);
      return () => clearTimeout(timer);
    }
  }, [stats.gamesPlayed, showRatePrompt]);

  const handleRateNow = async () => {
    setShowRatePrompt(false);
    completeRatePrompt();
    trackEvent('rate_prompt_accepted');
    const ok = await requestAppReview();
    if (!ok) toast.info(t('adOnlyInApp'));
  };

  const handleRateLater = () => {
    setShowRatePrompt(false);
    snoozeRatePrompt(stats.gamesPlayed);
    trackEvent('rate_prompt_later');
  };

  // Soft notification prompt after the first finished match (before Apple's sheet).
  const [showNotifAsk, setShowNotifAsk] = useState(false);
  useEffect(() => {
    if (showNotifAsk || !shouldAskForNotifications(stats.gamesPlayed)) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      if ((await getPushPermissionState()) !== 'prompt' || cancelled) return;
      setShowNotifAsk(true);
      trackEvent('notif_ask_shown');
    }, 1200);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats.gamesPlayed]);

  const closeNotifAsk = async (yes: boolean) => {
    setShowNotifAsk(false);
    markNotificationsAsked(stats.gamesPlayed, yes);
    trackEvent(yes ? 'notif_ask_yes' : 'notif_ask_later');
    if (yes) await requestPushPermission();
  };
  // Startup ad: on every cold start (iOS app only). Not on return from background.
  useEffect(() => {
    if (startupAdChecked) return;
    if (AD_BUTTON_LOCKED || !isAdMobAvailable()) return;
    if (!shouldShowDailyStartupAd()) return;
    // Start loading right away so the ad is usually ready when it is shown.
    void preloadAppOpenAd();
    const timer = setTimeout(async () => {
      if (startupAdChecked) return;
      startupAdChecked = true;
      // App Open-annons; ingen annons → appen fortsätter som vanligt
      if (await showAppOpenAd(() => window.location.pathname === '/' && document.visibilityState === 'visible')) {
        markDailyStartupAdShown();
        trackEvent('daily_startup_ad');
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  // Resume ad: away-time is tracked app-wide (any page). The ad itself is
  // only shown on the start screen — immediately if the app resumes there,
  // otherwise the next time the player lands on the start screen.
  useEffect(() => {
    if (AD_BUTTON_LOCKED || !isAdMobAvailable()) return;
    installResumeAdWatcher();
    if (resumeAdPending) {
      const timer = setTimeout(() => void tryShowResumeAd(), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  // Preload i bakgrunden – kan aldrig trigga visning. Väntar tills starten är klar.
  useEffect(() => {
    if (!isAdMobAvailable()) return;
    const timer = setTimeout(() => void preloadRewarded(), 4000);
    return () => clearTimeout(timer);
  }, []);

  // Rewarded-ad status is app-wide, so the button stays locked across page changes.
  const rewardedState = useSyncExternalStore(subscribeRewardedState, getRewardedState);
  const adBusy = adLoading || rewardedState !== 'idle';
  const adStatusText = rewardedState === 'showing' ? t('adShowingShort')
    : rewardedState === 'waiting' ? t('adWaitingShort')
    : adBusy ? t('adLoading') : null;

  /** Enda vägen till show(): användarens direkta tryck på "Frivillig reklam". */
  const handleOptionalAdClick = async () => {
    setShowAdsConsent(false);
    if (AD_BUTTON_LOCKED) return;
    if (adInFlightRef.current || getRewardedState() !== 'idle') return;
    adInFlightRef.current = true;
    setShowAdBubble(false);
    if (!isAdMobAvailable()) {
      toast.info(t('adOnlyInApp'));
      adInFlightRef.current = false;
      return;
    }
    setAdLoading(true);
    const loadingToast = toast.loading(t('adLoading'));
    try {
      const result = await optionalAdPair.run();
      toast.dismiss(loadingToast);
      if (result === 'failed' || result === 'unavailable') toast.error(t('adFailed'));
      if (result === 'not_earned') toast.info(t('adPairIncomplete'));
    } finally {
      toast.dismiss(loadingToast);
      setAdLoading(false);
      adInFlightRef.current = false;
    }
  };

  // Sync country + world ranking whenever the games_played count changes,
  // and re-run once the profile country becomes available (first launch).
  // The country is read inside the effect so a profile-changed re-render
  // (even without a language change) always re-syncs.
  useEffect(() => {
    let cancelled = false;
    // Not urgent (cached values are shown meanwhile): wait until the start
    // screen's entrance animation is done so it doesn't compete with it.
    const timer = setTimeout(() => {
      void syncCountryRank().then(res => {
        if (!cancelled) setRankInfo(res.country || res.world ? res : getCachedRankInfo());
      });
    }, 1200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [stats.gamesPlayed, profileVersion]);

  // Hall of Fame badge: cached rank at once, refreshed after the entrance animation.
  const [hofRank, setHofRank] = useState<number | null>(() => getCachedHofRank());
  useEffect(() => {
    const unsub = subscribeHofRank(setHofRank);
    const timer = setTimeout(() => { void syncMyHofRank(); }, 1500);
    return () => { unsub(); clearTimeout(timer); };
  }, [stats.gamesPlayed]);

  const [statusTick, setStatusTick] = useState(0);
  useEffect(() => {
    const onFocus = () => {
      setStats(getLocalStats());
      setActiveGames(getActiveGames());
      setStatusTick(n => n + 1);
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

  // Optional-ad reminder bubble removed (startup App Open ad replaces it).

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
      // The 48 h idle limit is enforced by a server job every 15 min, so the
      // home screen no longer waits for a global sweep before listing.
      // One query: my open games plus every player in them.
      const { data, error } = await supabase
        .from('game_players')
        .select('game_id, player_name, session_id, games!inner(id, status, game_code, created_at, game_players(player_name, session_id))')
        .eq('session_id', sessionId)
        .in('games.status', ['waiting', 'playing']);
      if (cancelled || error || !data) return;
      const serverGameIds = new Set<string>();
      const opponents: Record<string, string> = {};
      const playerCounts: Record<string, number> = {};
      for (const row of data as any[]) {
        const g = Array.isArray(row.games) ? row.games[0] : row.games;
        for (const p of (g?.game_players ?? []) as { player_name: string; session_id: string }[]) {
          playerCounts[row.game_id] = (playerCounts[row.game_id] ?? 0) + 1;
          if (p.session_id !== sessionId) opponents[row.game_id] = p.player_name;
        }
      }
      let changed = false;
      const lobbies: OpenLobby[] = [];
      const existing = new Set(getActiveGames().filter(g => g.gameId).map(g => g.gameId!));
      for (const row of data as any[]) {
        const gid = row.game_id as string;
        const g = Array.isArray(row.games) ? row.games[0] : row.games;
        const gameStatus = g?.status;
        const isSoloWaitingRoom = gameStatus === 'waiting' && (playerCounts[gid] ?? 0) < 2;
        if (isSoloWaitingRoom) {
          if (g?.game_code) {
            lobbies.push({ gameId: gid, code: g.game_code, createdAt: g.created_at });
          }
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
      if (!cancelled) setOpenLobbies(lobbies);
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
  const activeGamesRef = useRef(activeGames);
  activeGamesRef.current = activeGames;
  const mpKey = activeGames
    .filter(g => g.type === 'multiplayer' && g.gameId)
    .map(g => g.gameId!)
    .sort()
    .join(',');
  useEffect(() => {
    const mp = activeGamesRef.current.filter(g => g.type === 'multiplayer' && g.gameId);
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
        if (players && !me) {
          // I left (seat taken over by the computer) — no longer my match.
          removeActiveGame(id);
          removed = true;
          continue;
        }
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
    // Keyed on the set of match ids (+ focus), not the array itself: list
    // updates (time labels, lastRollTime refresh) must not trigger refetches.
  }, [mpKey, statusTick]);

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


  const homePrompt = getHomePrompt({ server: showServerNews, online: showOnlineNews, android: showAndroidNews, rate: showRatePrompt, notifications: showNotifAsk });

  return (
    <div
      className="app-fixed-screen flex flex-col items-center px-6 py-3 safe-top safe-bottom relative overflow-x-hidden overflow-y-auto [&::-webkit-scrollbar]:hidden"
      style={{ WebkitOverflowScrolling: 'touch', overscrollBehaviorY: 'contain', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >

      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-primary/6 blur-[120px]" />
      </div>

      <div
        className="fixed inset-x-0 -top-[100vh] -bottom-[100vh] pointer-events-none"
        style={{
          opacity: 0.035,
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'%3E%3Crect x='10' y='10' width='40' height='40' rx='8' fill='none' stroke='white' stroke-width='1.5'/%3E%3Ccircle cx='22' cy='22' r='3' fill='white'/%3E%3Ccircle cx='38' cy='22' r='3' fill='white'/%3E%3Ccircle cx='22' cy='38' r='3' fill='white'/%3E%3Ccircle cx='38' cy='38' r='3' fill='white'/%3E%3Ccircle cx='30' cy='30' r='3' fill='white'/%3E%3C/svg%3E")`,
          backgroundSize: '60px 60px',
        }}
      />

      <motion.div
        className="relative z-10 flex flex-col items-center gap-4 sm:gap-8 w-full max-w-sm my-auto after:absolute after:top-[calc(100%+0.5rem)] after:left-0 after:w-px after:h-40 after:content-['']"
        variants={{ show: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } } }}

        initial="hidden"
        animate="show"
      >
        <motion.div className="text-center space-y-1 sm:space-y-2" variants={item} transition={{ duration: 0.45, ease: 'easeOut' }}>
          <motion.div
            className="inline-flex items-center justify-center w-28 h-28 sm:w-36 sm:h-36 mb-2 sm:mb-4 drop-shadow-[0_6px_16px_hsl(195_50%_8%/0.45)]"
            animate={{ rotate: [0, 0, 4, -3, 0], scale: [1, 1, 1.05, 1.02, 1] }}
            transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 3, ease: 'easeInOut' }}
          >
            <img src={mrBDie} width={383} height={512} alt="" className="w-full h-full object-contain" loading="eager" decoding="async" />
          </motion.div>
          <h1 className="brand-wordmark text-4xl sm:text-5xl">
            Mr B Yatzy
          </h1>
          <p className="brand-tagline">
            {t('brandTagline')}
          </p>
        </motion.div>

        <div className="home-pending-stack home-card-stack w-full mt-8 sm:mt-10">
          <FriendRequestNotice />
          <HofRankNotice />
          <SentInvitesCards />
          {openLobbies.map((lb) => (
            <div
              key={lb.gameId}
              className="home-match-card home-match-card-info font-display"
            >
              <button
                onClick={() => navigate('/multiplayer', { state: { rejoinCode: lb.code } })}
                className="flex-1 min-w-0 flex items-center gap-2 h-full text-left active:scale-[0.98] transition"
              >
              <div className="home-card-chip">
                <Users />
              </div>

              <div className="match-card-body flex-1 min-w-0 flex flex-col justify-center gap-[3px]">
                <p className="font-bold text-[11px] leading-none truncate">{t('lobbyOpenCard', { code: lb.code })}</p>
                <p className="flex items-center gap-1 text-[8px] leading-none opacity-90">
                  <span className="w-1 h-1 rounded-full bg-background/80 animate-pulse flex-shrink-0" />
                  <span className="truncate">{t('waitingShort')}…</span>
                </p>
              </div>
              </button>
              <button
                onClick={async () => {
                  const ok = await cancelLobby(lb.gameId);
                  if (ok) setOpenLobbies((l) => l.filter((x) => x.gameId !== lb.gameId));
                  else toast.error(t('errGeneric'));
                }}
                className="home-card-pill"
              >
                {t('close')}
              </button>
            </div>
          ))}
          {activeGames.length > 0 && (
            <motion.div className="home-actions-stack home-card-stack" variants={item} transition={{ duration: 0.45, ease: 'easeOut' }}>
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
                    className={`home-match-card font-display ${myTurn ? 'home-match-card-turn' : 'home-match-card-waiting'}`}
                    whileTap={{ scale: 0.97 }}
                  >
                    <div className={`home-card-chip${myTurn ? ' home-card-chip-light' : ''}`}>
                      <Play />
                    </div>

                    <div className="match-card-body flex-1 min-w-0 flex flex-col justify-center gap-[3px]">
                      <div className="flex items-center leading-none">
                        <span className="match-card-name font-bold text-[11px] leading-none truncate inline-flex items-center gap-1.5">
                          {!isLocal && status?.opponentOnline && (
                            <span
                              className="inline-block w-1 h-1 rounded-full bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.9)]"
                              aria-label={t('onlineNow')}
                            />
                          )}
                          {isLocal ? (game.opponentName ?? t('resumeMatch')) : (opponent ?? t('resumeMatch'))}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-[8px] tabular-nums leading-none opacity-90">
                        <Clock className="w-2.5 h-2.5 flex-shrink-0" />
                        <span className="truncate">{t('ongoingMatchRemaining', { time: timeLeft })}</span>
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      {myTurn && (
                        <span className="home-card-pill home-card-pill-action animate-pulse">
                          {t('yourTurnLabel')}
                        </span>
                      )}
                      {(opponentTurn || waitingForStatus) && opponent && (
                        <span className="home-card-pill">
                          {t('waitingShort')}
                        </span>
                      )}
                    </div>
                  </motion.button>
                );
              })}
            </motion.div>
          )}


          {/* Main actions: Snabbspel above two equal companion buttons */}
          <div className="home-actions-stack home-button-stack">
            <div className="home-actions">
              {quickHint && (
                <div className="home-quick-hint" role="note">{onboardingCopy().hint}</div>
              )}
              <Button asChild className={`home-action home-quick-primary font-display${quickHint ? ' home-quick-glow' : ''}`}>
              <motion.button
                onClick={() => { if (quickHint) { markQuickHintDone(); setQuickHint(false); } setShowQuickMatch(v => !v); }}
                aria-expanded={showQuickMatch}
                whileTap={{ scale: 0.97 }}
                variants={item}
                transition={{ duration: 0.45, ease: 'easeOut' }}
              >
                <span aria-hidden="true" className="home-action-icon">🎲</span>
                <span>{t('quickMatch')}</span>
              </motion.button>
              </Button>
              <div className="home-actions-side">
                <Button asChild className="home-action home-companion-action font-display">
                <motion.button
                  onClick={() => navigate('/multiplayer')}
                  whileTap={{ scale: 0.97 }}
                  variants={item}
                  transition={{ duration: 0.45, ease: 'easeOut' }}
                >
                  <span aria-hidden="true" className="home-action-icon">🌐</span><span>{t('playWithFriends')}</span>
                </motion.button>
                </Button>
                <div className="relative min-w-0">
                  <Button asChild variant="waitingRoom" className="home-action home-waiting-action font-display w-full">
                    <motion.button disabled={waitingChecking} onClick={() => waitingSeated ? navigate('/waiting-room') : setWaitingEntryOpen(true)} whileTap={{ scale: 0.97 }} variants={item} transition={{ duration: 0.45, ease: 'easeOut' }} className="relative">
                      <Users /> <span className="flex flex-col items-start min-w-0"><span>{t('wrTitle')}</span>{waitingSeated && <span className="text-[10px] font-medium inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-game-success shrink-0" />{t('wrSeated')}</span>}</span>
                      {waitingCount > 0 && <span className="home-waiting-badge" aria-label={`${t('wrTitle')} (${waitingCount})`}>{waitingCount}</span>}
                    </motion.button>
                  </Button>
                </div>
              </div>
            </div>
            <AnimatePresence>
              {showQuickMatch && (
                <motion.div
                  className="space-y-2 overflow-hidden"
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
                          const humanName = getPlayerName() || t('playerN', { n: getAnonNumber() });
                          const aiNames = getRandomAiNames(opponents);
                          const playerNames = [humanName, ...aiNames];
                          const aiPlayers = Array.from({ length: opponents }, (_, i) => i + 1);
                          if (countActiveLocalGames() >= MAX_ACTIVE_LOCAL_GAMES) {
                            toast.error(t('maxActiveLocalGames', { max: MAX_ACTIVE_LOCAL_GAMES }));
                            return;
                          }
                          setOnlineSearch({ humanName, playerNames, aiPlayers });
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
              onClick={() => navigate('/stats')}
              className="home-action home-stats-action font-display relative"
              whileTap={{ scale: 0.97 }}
              variants={item}
              transition={{ duration: 0.45, ease: 'easeOut' }}
            >
              <BarChart3 /> <span>{t('statsPage')}</span>
              {hofRank && (
                <span
                  className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 rounded-full bg-game-gold text-background px-2 py-1 text-xs leading-none font-bold tabular-nums whitespace-nowrap shadow-md"
                  aria-label={`${t('hofBadgeLabel')} #${hofRank}`}
                >
                  <Trophy className="w-3.5 h-3.5" />#{hofRank}
                </span>
              )}
            </motion.button>
          </div>

          <AnimatePresence>
            {onlineSearch && (
              <QuickMatchSearch
                playerName={onlineSearch.humanName}
                players={onlineSearch.playerNames.length}
                onMatched={(id) => {
                  const players = onlineSearch.playerNames.length;
                  setOnlineSearch(null);
                  trackEvent('quick_match_online_matched', { players }, { gameMode: 'quick_match_online' });
                  navigate(`/multiplayer-game?gameId=${id}`);
                }}
                onNoMatch={() => {
                  const { playerNames, aiPlayers } = onlineSearch;
                  setOnlineSearch(null);
                  trackEvent('quick_match_started', { opponents: aiPlayers.length, fallback: true }, { gameMode: 'quick_match' });
                  navigate('/game', { state: { playerNames, aiPlayers, localGameId: newLocalGameId() } });
                }}
                onCancel={() => setOnlineSearch(null)}
              />
            )}
          </AnimatePresence>

          <OptionalAdsDialog open={showAdsConsent}
            onClose={() => setShowAdsConsent(false)} onStart={() => void handleOptionalAdClick()} />
          <WaitingRoomChoiceDialog open={waitingEntryOpen} mode="enter"
            onClose={() => setWaitingEntryOpen(false)} onSecondary={() => setWaitingEntryOpen(false)}
            onConfirm={() => { setWaitingEntryOpen(false); navigate('/waiting-room'); }} />
          {/* Premium round secondary actions */}
          <div className="relative w-full">
            <motion.div
              className="grid grid-cols-4 place-items-center gap-1 sm:gap-2 w-full pt-2"
              variants={item}
              transition={{ duration: 0.45, ease: 'easeOut' }}
            >
              <div className={`relative flex flex-col items-center gap-1.5 group transition-opacity duration-300 ${showAdBubble ? 'opacity-40' : 'opacity-100'}`} ref={langPickerRef}>
                <motion.button
                  onClick={() => setShowLangPicker(v => !v)}
                  className="home-round-action w-[46px] h-[46px] sm:w-[50px] sm:h-[50px] rounded-full flex items-center justify-center"
                  whileTap={{ scale: 0.92 }}
                  aria-label={t('selectLanguage')}
                >
                  <Globe className="w-4 h-4 sm:w-5 sm:h-5 text-background" />
                </motion.button>
                <span className="text-[8px] font-medium tracking-wider text-primary/60 uppercase whitespace-nowrap inline-flex items-start leading-none">{t('language')}</span>

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

              <div className="relative">
              <motion.button
                onClick={() => navigate('/settings')}
                className={`flex flex-col items-center gap-1.5 group transition-opacity duration-300 ${showAdBubble ? 'opacity-40' : 'opacity-100'}`}
                whileTap={{ scale: 0.92 }}
                aria-label={t('goSettings')}
              >
                <div className="home-round-action w-[46px] h-[46px] sm:w-[50px] sm:h-[50px] rounded-full flex items-center justify-center">
                  <Settings className="w-4 h-4 sm:w-5 sm:h-5 text-background" />
                </div>
                <span className="text-[8px] font-medium tracking-wider text-primary/60 uppercase whitespace-nowrap inline-flex items-start leading-none">{t('settings')}</span>
              </motion.button>
              </div>

              <motion.button
                onClick={() => navigate('/friends')}
                className={`flex flex-col items-center gap-1.5 group transition-opacity duration-300 ${showAdBubble ? 'opacity-40' : 'opacity-100'}`}
                whileTap={{ scale: 0.92 }}
                aria-label={t('friendsListTitle')}
              >
                <div className="home-round-action w-[46px] h-[46px] sm:w-[50px] sm:h-[50px] rounded-full flex items-center justify-center">
                  <Users className="w-4 h-4 sm:w-5 sm:h-5 text-background" />
                </div>
                <span className="text-[8px] font-medium tracking-wider text-primary/60 uppercase whitespace-nowrap inline-flex items-start leading-none">{t('friends')}</span>
              </motion.button>

              <div className="relative flex flex-col items-center">

                <motion.button
                  onClick={() => setShowAdsConsent(true)}
                  disabled={adBusy || AD_BUTTON_LOCKED}
                  className="flex flex-col items-center gap-1.5 group disabled:opacity-60"
                  whileTap={{ scale: AD_BUTTON_LOCKED ? 1 : 0.92 }}
                  aria-label={t('adButtonLabel')}
                >
                  <div className={`relative transition-opacity duration-300 ${showAdBubble ? 'opacity-40' : 'opacity-100'}`}>
                    {showAdBubble && !AD_BUTTON_LOCKED && (
                      <div className="absolute -inset-1 rounded-full border-2 border-primary/40 animate-pulse" />
                    )}
                    <div className="home-round-action w-[46px] h-[46px] sm:w-[50px] sm:h-[50px] rounded-full flex items-center justify-center">
                      <Play className="w-4 h-4 sm:w-5 sm:h-5 text-background" />
                    </div>
                  </div>
                  <span className="text-[8px] font-medium tracking-wider text-primary/60 uppercase whitespace-nowrap inline-flex items-start leading-none">{t('adButtonShort')}</span>
                  {adStatusText && !AD_BUTTON_LOCKED && (
                    <span role="status" className="text-[7px] font-medium text-primary/80 text-center leading-none -mt-1 whitespace-nowrap">{adStatusText}</span>
                  )}
                  {AD_BUTTON_LOCKED && (
                    <span className={`text-[7px] font-medium text-destructive text-center leading-none -mt-1 transition-opacity duration-300 ${showAdBubble ? 'opacity-40' : 'opacity-100'}`}>{t('adComingSoon')}</span>
                  )}
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
          <button
            type="button"
            onClick={() => setStatsExpanded(v => !v)}
            aria-expanded={statsExpanded}
            className="w-full flex items-center justify-center gap-1.5 mb-1"
          >
            <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
              {t('homeStatsTitle')}
            </span>
            <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform duration-200 ${statsExpanded ? 'rotate-180' : ''}`} />
          </button>
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

          {statsExpanded && (<>
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
          </>)}

          <div className="absolute top-[calc(100%+0.5rem)] left-0 right-0">
            <div className="text-center mt-2 mb-1">
              <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
                {t('challengesLabel')}
              </span>
            </div>
            <div className="pb-6 space-y-3">
              <DiceTierCard />
              <GoldInviteCard />
            </div>
          </div>

        </motion.div>
      </motion.div>

      <AnimatePresence>
        {homePrompt === 'server' && <ServerNewsPrompt onClose={closeServerNews} />}
        {homePrompt === 'online' && (
          <OnlineNewsPrompt onPlay={() => closeOnlineNews(true)} onClose={() => closeOnlineNews(false)} />
        )}
        {homePrompt === 'android' && (
          <AndroidNewsPrompt onClose={closeAndroidNews} />
        )}
        {homePrompt === 'rate' && (
          <RateAppPrompt onRate={handleRateNow} onLater={handleRateLater} />
        )}
        {homePrompt === 'notifications' && (
          <NotificationAskPrompt onYes={() => closeNotifAsk(true)} onLater={() => closeNotifAsk(false)} />
        )}
      </AnimatePresence>
    </div>

  );
}
