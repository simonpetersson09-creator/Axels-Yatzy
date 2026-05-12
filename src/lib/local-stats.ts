const STATS_KEY = 'yatzy-player-stats';

export interface LocalStats {
  gamesPlayed: number;
  wins: number;
  highScore: number;
  yatzyCount: number;
  currentStreak: number;
  bestStreak: number;
}

const DEFAULT_STATS: LocalStats = {
  gamesPlayed: 0,
  wins: 0,
  highScore: 0,
  yatzyCount: 0,
  currentStreak: 0,
  bestStreak: 0,
};

export function getLocalStats(): LocalStats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return { ...DEFAULT_STATS };
    const parsed = JSON.parse(raw);
    return {
      gamesPlayed: parsed.gamesPlayed ?? 0,
      wins: parsed.wins ?? 0,
      highScore: parsed.highScore ?? 0,
      yatzyCount: parsed.yatzyCount ?? 0,
      currentStreak: parsed.currentStreak ?? 0,
      bestStreak: parsed.bestStreak ?? 0,
    };
  } catch {
    return { ...DEFAULT_STATS };
  }
}

export function saveLocalStats(stats: LocalStats): void {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

export function recordGameResult(playerScore: number, won: boolean, yatzysThisGame = 0): void {
  const stats = getLocalStats();
  stats.gamesPlayed += 1;
  if (won) {
    stats.wins += 1;
    stats.currentStreak += 1;
    if (stats.currentStreak > stats.bestStreak) stats.bestStreak = stats.currentStreak;
  } else {
    stats.currentStreak = 0;
  }
  if (playerScore > stats.highScore) stats.highScore = playerScore;
  if (yatzysThisGame > 0) stats.yatzyCount += yatzysThisGame;
  saveLocalStats(stats);
}
