/** True when a fetched game snapshot is older than the one already shown. */
export function isStaleSnapshot(
  last: { gameId: string; updatedAt: string } | null,
  gameId: string,
  updatedAt: string | undefined,
): boolean {
  if (!last || last.gameId !== gameId || !updatedAt || !last.updatedAt) return false;
  return Date.parse(updatedAt) < Date.parse(last.updatedAt);
}
