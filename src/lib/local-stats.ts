const STATS_KEY = 'yatzy-player-stats';

export interface LocalStats {
  gamesPlayed: number;
  wins: number;
  highScore: number;
}

const DEFAULT_STATS: LocalStats = { gamesPlayed: 0, wins: 0, highScore: 0 };

export function getLocalStats(): LocalStats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return { ...DEFAULT_STATS };
    const parsed = JSON.parse(raw);
    return {
      gamesPlayed: parsed.gamesPlayed ?? 0,
      wins: parsed.wins ?? 0,
      highScore: parsed.highScore ?? 0,
    };
  } catch {
    return { ...DEFAULT_STATS };
  }
}

export function saveLocalStats(stats: LocalStats): void {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

export function recordGameResult(playerScore: number, won: boolean): void {
  const stats = getLocalStats();
  stats.gamesPlayed += 1;
  if (won) stats.wins += 1;
  if (playerScore > stats.highScore) stats.highScore = playerScore;
  saveLocalStats(stats);
}
