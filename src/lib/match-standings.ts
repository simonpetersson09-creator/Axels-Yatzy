/** Competition ranks: equal scores share a place; subsequent places skip tied seats. */
export function getMatchStandings<T extends { score: number }>(players: readonly T[]) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return sorted.map((player, index) => ({
    player,
    rank: sorted.findIndex(other => other.score === player.score) + 1,
    index,
  }));
}