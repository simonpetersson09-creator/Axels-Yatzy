/** Competition ranks: equal scores share a place; subsequent places skip tied seats. */
export function getMatchStandings<T extends { score: number }>(players: readonly T[]) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return sorted.map((player, index) => ({
    player,
    rank: sorted.findIndex(other => other.score === player.score) + 1,
    index,
  }));
}

/** Legacy names are usable only when exactly one seat matches. */
export function getForfeitPlayerIndex(players: readonly { name: string }[], index: unknown, name: string) {
  if (typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < players.length) return index;
  if (index !== undefined && index !== null) return null;
  const matches = players.flatMap((p, i) => p.name === name ? [i] : []);
  return matches.length === 1 ? matches[0] : null;
}