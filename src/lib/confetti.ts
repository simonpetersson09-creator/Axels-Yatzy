// Lightweight canvas confetti — no dependencies, throttles for low-power devices.
// Premium arcade/casino palette, top burst with gravity + spread.

const COLORS = [
  '#F5C451', // amber
  '#E8A33D', // gold
  '#F3E5C0', // cream
  '#7DD3C0', // mint petrol
  '#5BB7E5', // soft cyan
  '#E5658B', // rose
];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  size: number;
  color: string;
  shape: 'rect' | 'circle';
  life: number;
  maxLife: number;
}

let activeRunId = 0;

function isLowPowerDevice(): boolean {
  // Heuristic: low logical CPU count or older iOS — throttle particles.
  const cores = (navigator as any).hardwareConcurrency ?? 4;
  if (cores <= 4) return true;
  const ua = navigator.userAgent;
  if (/iPhone OS (1[0-3]|9_)/.test(ua)) return true;
  return false;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/**
 * Fire a confetti burst. Returns a cleanup function that removes the canvas.
 * Auto-cleans after the animation completes (~2.5–3.5s).
 */
export function fireWinConfetti(opts: { durationMs?: number } = {}): () => void {
  if (typeof window === 'undefined') return () => {};
  if (prefersReducedMotion()) return () => {};

  const runId = ++activeRunId;
  const duration = opts.durationMs ?? 2800;
  const lowPower = isLowPowerDevice();
  const particleCount = lowPower ? 70 : 140;

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:9999;';
  document.body.appendChild(canvas);

  const dpr = Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 2);
  const resize = () => {
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
  };
  resize();
  window.addEventListener('resize', resize);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return () => {};
  }

  const W = () => canvas.width;
  const H = () => canvas.height;

  const particles: Particle[] = [];
  // Two burst origins near the top — feels like a stage drop.
  const origins = [0.3, 0.7];
  for (let i = 0; i < particleCount; i++) {
    const ox = origins[i % origins.length];
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.6; // upward fan
    const speed = (8 + Math.random() * 10) * dpr;
    particles.push({
      x: W() * ox,
      y: H() * 0.05,
      vx: Math.cos(angle) * speed * (0.6 + Math.random() * 0.8),
      vy: Math.sin(angle) * speed - 2 * dpr,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.3,
      size: (6 + Math.random() * 6) * dpr,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      shape: Math.random() < 0.6 ? 'rect' : 'circle',
      life: 0,
      maxLife: duration + Math.random() * 600,
    });
  }

  const gravity = 0.35 * dpr;
  const drag = 0.992;
  const start = performance.now();
  let rafId = 0;

  const tick = (now: number) => {
    if (runId !== activeRunId) {
      cleanup();
      return;
    }
    const elapsed = now - start;
    ctx.clearRect(0, 0, W(), H());

    let alive = 0;
    for (const p of particles) {
      p.life = elapsed;
      if (p.life > p.maxLife) continue;
      p.vy += gravity;
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;

      const fadeStart = p.maxLife - 600;
      const alpha = p.life < fadeStart ? 1 : Math.max(0, 1 - (p.life - fadeStart) / 600);

      if (p.y < H() + 40 * dpr && alpha > 0) {
        alive++;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.shape === 'rect') {
          ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.55);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    if (alive > 0 && elapsed < duration + 800) {
      rafId = requestAnimationFrame(tick);
    } else {
      cleanup();
    }
  };

  const cleanup = () => {
    cancelAnimationFrame(rafId);
    window.removeEventListener('resize', resize);
    canvas.remove();
  };

  rafId = requestAnimationFrame(tick);
  return cleanup;
}

export function tryHapticWin() {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate?.([15, 40, 25, 40, 60]);
    }
  } catch {
    // ignore
  }
}
