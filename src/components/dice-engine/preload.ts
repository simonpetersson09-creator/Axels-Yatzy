/**
 * Warms the dice engine well before the first roll.
 *
 * The engine (three.js + R3F + drei) is a large lazy chunk. If it is still
 * being fetched/parsed when the player hits "Kasta" for the first time, the
 * canvas mounts, compiles its shaders and uploads textures in the exact frame
 * the fly-in animation starts — which reads as a stutter on the very first
 * roll. Prefetching the chunk during idle time removes that spike.
 */
let started = false;

export function preloadDiceEngine(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  const run = () => {
    // Importing alone does not prepare geometry: the engine is already eagerly
    // imported by gameplay. Prepare its shared body during idle on Home.
    void import("./body-geometry").then(({ getDiceBodyGeometry }) => {
      if (window.location.pathname === '/' && !document.hidden) getDiceBodyGeometry();
    }).catch(() => { /* Gameplay can still prepare it on demand. */ });
  };
  const ric = (window as unknown as {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  }).requestIdleCallback;
  if (ric) ric(run, { timeout: 1500 });
  else window.setTimeout(run, 300);
}
