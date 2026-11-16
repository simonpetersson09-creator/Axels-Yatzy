/**
 * A local match must always have the computer as an opponent. Solo play is
 * not a mode in the app: a lost or one-player lineup is repaired to one
 * computer opponent so a match never starts (or replays) as solo by accident.
 */
export function resolveLocalLineup(
  names: string[] | null | undefined,
  ai: number[] | null | undefined,
  fallbackName: string,
  aiName: () => string,
): { playerNames: string[]; aiPlayers: number[] } {
  const validNames = Array.isArray(names) ? names.filter(n => typeof n === 'string') : [];
  if (validNames.length >= 2) {
    const validAi = Array.isArray(ai) ? ai.filter(i => Number.isInteger(i) && i > 0 && i < validNames.length) : [];
    return { playerNames: validNames, aiPlayers: validAi.length ? validAi : validNames.slice(1).map((_, i) => i + 1) };
  }
  return { playerNames: [validNames[0] || fallbackName, aiName()], aiPlayers: [1] };
}

/** Solo results never reach top lists, world ranking or wins. */
export function isRankedLocalMatch(playerCount: number): boolean {
  return playerCount >= 2;
}
