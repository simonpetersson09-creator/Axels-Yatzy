// Explicit non-game destinations: unknown routes and the waiting room stay protected.
const SAFE_PATHS = new Set(['/', '/index', '/setup', '/multiplayer', '/settings', '/stats', '/friends', '/friend-stats']);
let currentPath = window.location.pathname;
let gameGeneration = 0;

export function setAppOpenPath(path: string): void {
  if (path !== currentPath && (path === '/game' || path === '/multiplayer-game')) gameGeneration++;
  currentPath = path;
}

/** A started game permanently invalidates this attempt, including after returning home. */
export function createAppOpenNavigationGuard(): () => boolean {
  const generation = gameGeneration;
  return () => generation === gameGeneration && SAFE_PATHS.has(currentPath) && document.visibilityState === 'visible';
}