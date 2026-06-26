import { useState, useEffect, useMemo, useRef, memo } from 'react';
import { motion, AnimatePresence, useMotionValue, useMotionValueEvent } from 'framer-motion';
import { cn } from '@/lib/utils';
import { playRollSound, playLandSound } from '@/lib/dice-sounds';

// Pip layout per face (3x3 grid positions, 0-8 indices)
const PIP_POSITIONS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

interface DiceProps {
  value: number;
  locked: boolean;
  rolling: boolean;
  onToggleLock: () => void;
  canLock: boolean;
  size?: number;
}


const valueToRotation: Record<number, { rotateX: number; rotateY: number }> = {
  1: { rotateX: 0, rotateY: 0 },
  2: { rotateX: 0, rotateY: 90 },
  3: { rotateX: 90, rotateY: 0 },
  4: { rotateX: -90, rotateY: 0 },
  5: { rotateX: 0, rotateY: -90 },
  6: { rotateX: 0, rotateY: 180 },
};

const ANIM_DURATION = 1.5;

// Pure CSS ivory die face. Highlight position is driven by CSS variables
// (--lx / --ly) on the cube root, so the glint truly *moves* across the face
// as the dice rotates (premium dynamic specular).
const DiceFace = memo(function DiceFace({ faceValue, size }: {
  faceValue: number;
  size: number;
}) {
  const radius = Math.round(size * 0.28);
  const pipSize = Math.max(6, Math.round(size * 0.16));
  const pad = Math.round(size * 0.15);
  const positions = PIP_POSITIONS[faceValue] ?? [];
  return (
    <div
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: radius,
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
        // Ivory body
        background: 'linear-gradient(135deg, #fffefb 0%, #f8f4ea 40%, #e8e0d0 100%)',
        boxShadow: [
          // #2 chamfered edges: double inset ring (bright outer + faint dark inner) simulates a bevel
          'inset 0 0 0 1px rgba(255,255,255,0.95)',
          'inset 0 0 0 2px rgba(210,198,178,0.55)',
          'inset 3.5px 3.5px 5px rgba(255,255,255,0.98)',
          'inset -3.5px -4px 6px rgba(70,60,48,0.34)',
          // soft chamfer glow along top/left edge
          'inset 1px 1px 0 rgba(255,255,255,0.85)',
        ].join(', '),
        pointerEvents: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        overflow: 'hidden',
      }}
    >
      {/* Dynamic moving specular highlight — position driven by --lx/--ly on cube root */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: radius,
          background:
            'radial-gradient(circle at var(--lx, 22%) var(--ly, 18%), rgba(255,255,255,1) 0%, rgba(255,255,255,0) 48%)',
          pointerEvents: 'none',
          mixBlendMode: 'screen',
        }}
      />
      {/* Opposite ambient occlusion — also driven by light vars */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: radius,
          background:
            'radial-gradient(circle at var(--sx, 90%) var(--sy, 92%), rgba(95,82,65,0.32) 0%, rgba(95,82,65,0) 62%)',
          pointerEvents: 'none',
        }}
      />
      {/* Subtle glossy sheen */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: radius,
          background:
            'linear-gradient(155deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0) 38%)',
          pointerEvents: 'none',
        }}
      />
      {/* #5 Material grain — subtle SVG noise to kill the plastic look */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: radius,
          pointerEvents: 'none',
          opacity: 0.22,
          mixBlendMode: 'multiply',
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.4' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.55  0 0 0 0 0.50  0 0 0 0 0.42  0 0 0 0.6 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
          backgroundSize: '80px 80px',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: pad,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gridTemplateRows: 'repeat(3, 1fr)',
        }}
      >
        {Array.from({ length: 9 }).map((_, i) => {
          const show = positions.includes(i);
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {show && (
                <div
                  style={{
                    width: pipSize,
                    height: pipSize,
                    borderRadius: '50%',
                    background: '#000',
                    boxShadow: [
                      'inset 2px 2.5px 3px rgba(0,0,0,0.9)',
                      'inset -1px -1.5px 1.5px rgba(255,255,255,0.22)',
                      '0 1.5px 2px rgba(0,0,0,0.45)',
                      '0 0 0 0.5px rgba(0,0,0,0.25)',
                    ].join(', '),
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});


export function Dice({ value, locked, rolling, onToggleLock, canLock, size = 56 }: DiceProps) {
  const [isAnimating, setIsAnimating] = useState(false);
  const [spinRotation, setSpinRotation] = useState(valueToRotation[value]);
  const [showSparkle, setShowSparkle] = useState(false);
  const prevLockedRef = useRef(locked);
  const rollingRef = useRef(false);
  const rotationRef = useRef(valueToRotation[value]);
  const cubeRef = useRef<HTMLDivElement | null>(null);
  const half = size / 2;
  const radius = Math.round(size * 0.28);
  const faces = useMemo(() => [
    { v: 1, t: `translateZ(${half}px)` },
    { v: 6, t: `rotateY(180deg) translateZ(${half}px)` },
    { v: 2, t: `rotateY(-90deg) translateZ(${half}px)` },
    { v: 5, t: `rotateY(90deg) translateZ(${half}px)` },
    { v: 3, t: `rotateX(-90deg) translateZ(${half}px)` },
    { v: 4, t: `rotateX(90deg) translateZ(${half}px)` },
  ], [half]);

  const makeRollVar = () => ({
    spinsX: (2 + Math.floor(Math.random() * 2)) * 360,
    spinsY: (2 + Math.floor(Math.random() * 2)) * 360,
    dt: (Math.random() - 0.5) * 0.1,
    bounceY: -4 - Math.random() * 4,
  });
  const rollVarRef = useRef(makeRollVar());
  const [rollVar, setRollVar] = useState(rollVarRef.current);


  const dur = ANIM_DURATION + rollVar.dt;

  // #3 — Dynamic light: track live rotation values, project a virtual light
  // direction onto the cube and expose it as CSS vars (--lx/--ly + --sx/--sy)
  // so highlights/shadows on every face shift as the dice tumbles.
  const rotXMV = useMotionValue(spinRotation.rotateX);
  const rotYMV = useMotionValue(spinRotation.rotateY);

  const applyLight = (rx: number, ry: number) => {
    // Normalize to -180..180
    const norm = (n: number) => {
      const m = ((n + 180) % 360 + 360) % 360 - 180;
      return m;
    };
    const nx = norm(rx);
    const ny = norm(ry);
    // Move highlight opposite to rotation (light stays fixed in world space).
    // Range ~10%..90% so it stays inside the face.
    const lx = 50 - (ny / 180) * 40;
    const ly = 50 - (nx / 180) * 40;
    const sx = 100 - lx;
    const sy = 100 - ly;
    const el = cubeRef.current;
    if (el) {
      el.style.setProperty('--lx', `${lx}%`);
      el.style.setProperty('--ly', `${ly}%`);
      el.style.setProperty('--sx', `${sx}%`);
      el.style.setProperty('--sy', `${sy}%`);
    }
  };

  useMotionValueEvent(rotXMV, 'change', v => applyLight(v, rotYMV.get()));
  useMotionValueEvent(rotYMV, 'change', v => applyLight(rotXMV.get(), v));

  useEffect(() => {
    applyLight(spinRotation.rotateX, spinRotation.rotateY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (rolling && !locked && !rollingRef.current) {
      rollingRef.current = true;
      const fresh = makeRollVar();
      rollVarRef.current = fresh;
      setRollVar(fresh);
      const thisDur = ANIM_DURATION + fresh.dt;
      setIsAnimating(true);
      const base = valueToRotation[value];
      const cur = rotationRef.current;
      const mod = (n: number) => ((n % 360) + 360) % 360;
      const newTarget = {
        rotateX: cur.rotateX + fresh.spinsX + mod(base.rotateX - cur.rotateX),
        rotateY: cur.rotateY + fresh.spinsY + mod(base.rotateY - cur.rotateY),
      };
      rotationRef.current = newTarget;
      setSpinRotation(newTarget);
      playRollSound(thisDur);
      const t = setTimeout(() => {
        setIsAnimating(false);
        rollingRef.current = false;
        playLandSound();
      }, thisDur * 1000);
      return () => clearTimeout(t);
    } else if (!rolling) {
      rollingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolling, value, locked]);

  useEffect(() => {
    if (locked && !prevLockedRef.current) {
      setShowSparkle(true);
      const t = setTimeout(() => setShowSparkle(false), 600);
      return () => clearTimeout(t);
    }
    prevLockedRef.current = locked;
  }, [locked]);

  useEffect(() => {
    const base = valueToRotation[value];
    const cur = rotationRef.current;
    const mod = (n: number) => ((n % 360) + 360) % 360;
    const deltaX = (base.rotateX - mod(cur.rotateX) + 360) % 360;
    const deltaY = (base.rotateY - mod(cur.rotateY) + 360) % 360;
    if (deltaX === 0 && deltaY === 0) return;
    const retarget = {
      rotateX: cur.rotateX + deltaX,
      rotateY: cur.rotateY + deltaY,
    };
    rotationRef.current = retarget;
    setSpinRotation(retarget);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);


  const handleToggle = () => {
    if (!canLock) return;
    onToggleLock();
    if ('vibrate' in navigator) {
      navigator.vibrate(5);
    }
  };

  const sparkles = useMemo(() =>
    Array.from({ length: 5 }, (_, i) => {
      const a = (i / 5) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const d = 26 + Math.random() * 14;
      return { x: Math.cos(a) * d, y: Math.sin(a) * d, size: 3 + Math.random() * 2.5, delay: Math.random() * 0.1 };
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [locked]);

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={!canLock}
      aria-label="Toggle dice lock"
      className={cn(
        'relative flex flex-col items-center overflow-visible touch-manipulation p-0 m-0 bg-transparent border-0 outline-none',
        canLock ? 'cursor-pointer' : 'cursor-default',
      )}
      style={{ width: size, height: size + 10, WebkitTapHighlightColor: 'transparent' }}
    >
      {/* Lock sparkles */}
      <AnimatePresence>
        {showSparkle && sparkles.map((s, i) => (
          <motion.div
            key={`sp-${i}`}
            className="absolute pointer-events-none"
            style={{
              width: s.size, height: s.size, borderRadius: '50%',
              background: 'radial-gradient(circle, hsl(42 90% 70%), hsl(36 82% 52%))',
              boxShadow: '0 0 6px hsl(42 90% 60%)',
              left: '50%', top: '50%',
              marginLeft: -s.size / 2, marginTop: -s.size / 2, zIndex: 50,
            }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 0.5 }}
            animate={{ x: s.x, y: s.y, opacity: 0, scale: 1.2 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, delay: s.delay, ease: 'easeOut' }}
          />
        ))}
      </AnimatePresence>

      {/* Lock pulse ring */}
      <AnimatePresence>
        {showSparkle && (
          <motion.div
            className="absolute pointer-events-none"
            style={{
              width: size + 10, height: size + 10, borderRadius: radius + 5,
              border: '2px solid hsl(36 82% 52%)',
              left: '50%', top: half,
              marginLeft: -(size + 10) / 2, marginTop: -(size + 10) / 2, zIndex: 49,
            }}
            initial={{ scale: 0.8, opacity: 0.8 }}
            animate={{ scale: 1.3, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>

      {/* Outer wrapper — lock glow only (no drop-shadow; contact shadow is below) */}
      <motion.div
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          willChange: 'auto',
          boxShadow: locked
            ? '0 0 0 2.5px hsl(36 72% 50%), 0 0 18px rgba(245,185,66,0.3)'
            : 'none',
          transition: 'box-shadow 0.45s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.45s cubic-bezier(0.22, 1, 0.36, 1)',
          opacity: canLock && !locked ? 0.5 : 1,
        }}
      >
        <div style={{ perspective: Math.round(size * 4.3), width: size, height: size, pointerEvents: 'none' }}>
          <motion.div
            ref={cubeRef}
            className="relative"
            style={{
              width: size,
              height: size,
              transformStyle: 'preserve-3d',
              willChange: isAnimating ? 'transform' : 'auto',
              rotateX: rotXMV,
              rotateY: rotYMV,
            }}
            animate={{
              rotateX: spinRotation.rotateX,
              rotateY: spinRotation.rotateY,
              y: isAnimating ? [0, rollVar.bounceY, 2, -1, 0] : 0,
              // #6 Landing bounce: tiny squash on impact then settle
              scale: isAnimating ? [1, 1, 0.96, 1.03, 1] : 1,
              // #7 Motion blur during fastest part of the spin, off at rest/landing
              filter: isAnimating
                ? ['blur(0px)', 'blur(0.7px)', 'blur(0.3px)', 'blur(0px)', 'blur(0px)']
                : 'blur(0px)',
            }}
            transition={
              isAnimating
                ? {
                    rotateX: { duration: dur, ease: [0.16, 1, 0.3, 1] },
                    rotateY: { duration: dur, ease: [0.16, 1, 0.3, 1] },
                    y: { duration: dur, times: [0, 0.55, 0.78, 0.92, 1], ease: [0.22, 1, 0.36, 1] },
                    scale: { duration: dur, times: [0, 0.55, 0.78, 0.9, 1], ease: 'easeOut' },
                    filter: { duration: dur, times: [0, 0.3, 0.65, 0.85, 1], ease: 'easeOut' },
                  }
                : { duration: 0.45, ease: [0.22, 1, 0.36, 1] }
            }
          >
            {faces.map(f => (
              <div key={f.v} className="absolute inset-0" style={{ transform: f.t, transformStyle: 'preserve-3d' }}>
                {/* Ivory backing plate behind this face so transparent rounded corners don't show table */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: radius,
                    background: 'linear-gradient(135deg, #fffefb 0%, #f8f4ea 40%, #e8e0d0 100%)',
                    transform: 'translateZ(-1px)',
                    pointerEvents: 'none',
                    backfaceVisibility: 'hidden',
                    WebkitBackfaceVisibility: 'hidden',
                  }}
                />
                <DiceFace faceValue={f.v} size={size} />
              </div>
            ))}
          </motion.div>
        </div>
      </motion.div>

      {/* #4 — Real contact shadow: separate elliptical div that squashes & darkens
          on the landing bounce, then settles. Gives genuine "weight on table" feel. */}
      <motion.div
        style={{
          width: size * 0.82,
          height: 8,
          marginTop: 4,
          borderRadius: '50%',
          pointerEvents: 'none',
          filter: 'blur(3px)',
          background: locked
            ? 'radial-gradient(ellipse, rgba(245,185,66,0.4), rgba(245,185,66,0.08) 55%, transparent 75%)'
            : 'radial-gradient(ellipse, rgba(0,0,0,0.55), rgba(0,0,0,0.14) 55%, transparent 75%)',
        }}
        animate={{
          // Shadow shrinks while die is airborne, then SLAMS bigger+darker at the
          // landing keyframe (0.78), then settles.
          scaleX: isAnimating ? [1, 0.55, 1.25, 1.05, 1] : locked ? 1.08 : 1,
          scaleY: isAnimating ? [1, 0.45, 1.35, 1.05, 1] : 1,
          opacity: isAnimating ? [0.6, 0.18, 0.85, 0.62, 0.6] : 0.6,
        }}
        transition={
          isAnimating
            ? { duration: dur, times: [0, 0.55, 0.78, 0.9, 1], ease: 'easeOut' }
            : { duration: 0.3, ease: 'easeOut' }
        }
      />
    </button>
  );
}
