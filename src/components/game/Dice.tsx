import { useState, useEffect, useMemo, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { playRollSound, playLandSound } from '@/lib/dice-sounds';

// Pip layout per face (3x3 grid positions, 0-8 indices)
// 0 1 2
// 3 4 5
// 6 7 8
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
  hasRolled?: boolean;
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

// Pure CSS ivory die face with deep black pips — premium 3D look, no pre-rendered art.
// Pips are absolutely positioned on a percentage grid so every pip is pixel-identical
// (a CSS grid with `1fr` tracks rounds each cell differently and made pips look
// like they had slightly different sizes/offsets).
const PIP_COORDS: Record<number, [number, number]> = {
  0: [24, 24], 1: [50, 24], 2: [76, 24],
  3: [24, 50], 4: [50, 50], 5: [76, 50],
  6: [24, 76], 7: [50, 76], 8: [76, 76],
};

// Vector (SVG) die face. SVG is resolution-independent, so even when WebKit
// rasterizes the rotating 3D subtree the source geometry (rounded body, bevel,
// pips) stays smooth instead of showing the stair-stepped edges CSS boxes gave.
// Everything is authored in a 0..100 viewBox and scaled to the face size.
const DiceFace = memo(function DiceFace({ faceValue, size }: {
  faceValue: number;
  size: number;
}) {
  const radius = size * 0.28;
  const r = 28; // corner radius in viewBox units
  const pipR = 7.75; // pip radius in viewBox units (matches previous 15.5% diameter)
  const positions = PIP_POSITIONS[faceValue] ?? [];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      shapeRendering="geometricPrecision"
      style={{
        position: 'absolute',
        display: 'block',
        borderRadius: radius,
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
        pointerEvents: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      <defs>
        {/* ivory body, lit from the upper-left */}
        <linearGradient id="dfBody" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fffefb" />
          <stop offset="40%" stopColor="#fbf7ef" />
          <stop offset="74%" stopColor="#f0e9db" />
          <stop offset="100%" stopColor="#e5dcc9" />
        </linearGradient>
        {/* top-left specular highlight */}
        <radialGradient id="dfSpec" cx="0.22" cy="0.18" r="0.46">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        {/* warm bounce light bottom-left */}
        <radialGradient id="dfBounce" cx="0.12" cy="0.92" r="0.42">
          <stop offset="0%" stopColor="#fff6e1" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#fff6e1" stopOpacity="0" />
        </radialGradient>
        {/* bottom-right ambient occlusion */}
        <radialGradient id="dfAo" cx="0.92" cy="0.94" r="0.9">
          <stop offset="0%" stopColor="#60523e" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#60523e" stopOpacity="0" />
        </radialGradient>

        {/* glossy sheen across the upper part of the face */}
        <linearGradient id="dfSheen" x1="0.25" y1="0" x2="0.75" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="30%" stopColor="#ffffff" stopOpacity="0.1" />
          <stop offset="48%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        {/* rounded-edge bevel: light top-left, fading to nothing (no dark line
            along the bottom-right edge). */}
        <linearGradient id="dfBevel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>

        {/* drilled pip: dark well with a faint kick at bottom-right */}
        <radialGradient id="dfPip" cx="0.66" cy="0.72" r="0.78">
          <stop offset="0%" stopColor="#2b2721" />
          <stop offset="44%" stopColor="#0c0b09" />
          <stop offset="100%" stopColor="#000000" />
        </radialGradient>
        {/* recess rim: dark at the top-left of the hole, light at bottom-right */}
        <linearGradient id="dfPipRim" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#000000" stopOpacity="0.85" />
          <stop offset="55%" stopColor="#000000" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.3" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="100" height="100" rx={r} ry={r} fill="url(#dfBody)" />
      <rect x="0" y="0" width="100" height="100" rx={r} ry={r} fill="url(#dfSpec)" />
      <rect x="0" y="0" width="100" height="100" rx={r} ry={r} fill="url(#dfBounce)" />
      <rect x="0" y="0" width="100" height="100" rx={r} ry={r} fill="url(#dfAo)" />
      <rect x="0" y="0" width="100" height="100" rx={r} ry={r} fill="url(#dfSheen)" />
      {/* inner bevel rim — 3D volume on the rounded edges */}
      <rect
        x="1.6" y="1.6" width="96.8" height="96.8"
        rx={r - 1.6} ry={r - 1.6}
        fill="none" stroke="url(#dfBevel)" strokeWidth="3.2"
      />
      <rect
        x="0.5" y="0.5" width="99" height="99"
        rx={r - 0.5} ry={r - 0.5}
        fill="none" stroke="#ffffff" strokeOpacity="0.7" strokeWidth="1"
      />

      {positions.map(i => {
        const [cx, cy] = PIP_COORDS[i];
        return (
          <g key={i}>
            {/* Soft carved rim: a faint ring around the hole instead of an
                offset white disc (that read as a light streak next to pips). */}
            <circle
              cx={cx} cy={cy} r={pipR + 0.35}
              fill="none" stroke="#ffffff" strokeOpacity="0.28" strokeWidth="0.7"
            />
            <circle cx={cx} cy={cy} r={pipR} fill="url(#dfPip)" />
            <circle
              cx={cx} cy={cy} r={pipR - 0.45}
              fill="none" stroke="url(#dfPipRim)" strokeWidth="0.9"
            />
          </g>

        );
      })}
    </svg>
  );
});




export function Dice({ value, locked, rolling, onToggleLock, canLock, size = 56, hasRolled = true }: DiceProps) {
  const initialFace = useMemo(() => 1 + Math.floor(Math.random() * 6), []);
  const displayValue = hasRolled ? value : initialFace;

  const [isAnimating, setIsAnimating] = useState(false);
  // `snap` lives in state (not a ref mutated during render) so the transition
  // is a pure function of state — a stray re-render can no longer consume the
  // snap flag and leave a 0.45s glide after landing (visible as flimmer).
  const [spinRotation, setSpinRotation] = useState({ ...valueToRotation[displayValue], snap: false });
  const [showSparkle, setShowSparkle] = useState(false);
  const prevLockedRef = useRef(locked);
  const rollingRef = useRef(false);
  const rotationRef = useRef(valueToRotation[displayValue]);
  // Snap ("duration 0") is carried on the rotation state itself — see above.

  const half = size / 2;
  const radius = Math.round(size * 0.22);
  // Supersampling: build the cube at 2x and scale it down. WebKit rasterizes
  // a 3D subtree once at its layout size, so rendering at 2x removes the
  // pixelated/aliased edges and pips on retina screens. (3x was tested and
  // looked worse — the extra layer size made WebKit downgrade rasterization.)
  const SS = 2;
  const S = size * SS;
  const halfS = S / 2;
  const faces = useMemo(() => [
    { v: 1, t: `translateZ(${halfS}px)` },
    { v: 6, t: `rotateY(180deg) translateZ(${halfS}px)` },
    { v: 2, t: `rotateY(-90deg) translateZ(${halfS}px)` },
    { v: 5, t: `rotateY(90deg) translateZ(${halfS}px)` },
    { v: 3, t: `rotateX(-90deg) translateZ(${halfS}px)` },
    { v: 4, t: `rotateX(90deg) translateZ(${halfS}px)` },
  ], [halfS]);


  const makeRollVar = () => ({
    // Premium: 2-3 spins per axis, gentle deceleration. No wild spin.
    spinsX: (2 + Math.floor(Math.random() * 2)) * 360,
    spinsY: (2 + Math.floor(Math.random() * 2)) * 360,
    // Keep every die on the exact same landing clock. Even a tiny per-die
    // duration drift makes 2-3 dice appear to "move after" the rest stopped.
    dt: 0,
    bounceY: -4 - Math.random() * 4,
  });
  const rollVarRef = useRef(makeRollVar());

  const dur = ANIM_DURATION + rollVarRef.current.dt;

  useEffect(() => {
    if (rolling && !locked && !rollingRef.current) {
      rollingRef.current = true;
      // Freeze a new set of random seeds for this roll only — prevents
      // re-randomization mid-animation that caused a visible second "settle" spin.
      const fresh = makeRollVar();
      rollVarRef.current = fresh;
      const thisDur = ANIM_DURATION + fresh.dt;
      setIsAnimating(true);
      const base = valueToRotation[displayValue];
      const cur = rotationRef.current;
      const mod = (n: number) => ((n % 360) + 360) % 360;
      const newTarget = {
        rotateX: cur.rotateX + fresh.spinsX + mod(base.rotateX - cur.rotateX),
        rotateY: cur.rotateY + fresh.spinsY + mod(base.rotateY - cur.rotateY),
      };
      rotationRef.current = newTarget;
      setSpinRotation({ ...newTarget, snap: false });
      playRollSound(thisDur);
      return;
    } else if (!rolling && !rollingRef.current) {
      const base = valueToRotation[displayValue];
      const cur = rotationRef.current;
      const mod = (n: number) => ((n % 360) + 360) % 360;
      const deltaX = mod(base.rotateX - cur.rotateX);
      const deltaY = mod(base.rotateY - cur.rotateY);
      if (deltaX !== 0 || deltaY !== 0) {
        const snapTarget = {
          rotateX: cur.rotateX + deltaX,
          rotateY: cur.rotateY + deltaY,
        };
        rotationRef.current = snapTarget;
        setSpinRotation({ ...snapTarget, snap: true });
      }
    }
    // Intentionally do not depend on displayValue: the roll starts once per
    // rolling pulse, using the value from that render. If a late server sync
    // changes value while the parent still has rolling=true, depending on
    // displayValue can start a second full spin after the dice already landed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolling, locked]);


  useEffect(() => {
    if (locked && !prevLockedRef.current) {
      setShowSparkle(true);
      const t = setTimeout(() => setShowSparkle(false), 600);
      return () => clearTimeout(t);
    }
    prevLockedRef.current = locked;
  }, [locked]);

  // Re-sync rotation when `value` changes (incl. mid-spin). Without this the
  // dice keeps spinning toward the OLD target if the authoritative server
  // dice land after the local animation started — user sees stale faces
  // (e.g. all 1s after the first roll, or wrong pips when scoring).
  //
  // Signed shortest-path correction: pick the direction (+delta or -(360-delta))
  // that rotates the least. Max correction is now ±180° instead of 0..359°,
  // which removes the visible horizontal "extra spin" at the end of a roll
  // when the authoritative server value arrives after the local animation.
  useEffect(() => {
    if (rollingRef.current) return;
    const base = valueToRotation[displayValue];
    const cur = rotationRef.current;
    const mod = (n: number) => ((n % 360) + 360) % 360;
    // Shortest signed delta in range (-180, 180].
    const shortest = (from: number, to: number) => {
      const d = ((to - mod(from)) % 360 + 540) % 360 - 180;
      // Normalize -180 vs 180: prefer +180 for consistency (either is fine visually).
      return d === -180 ? 180 : d;
    };
    const deltaX = shortest(cur.rotateX, base.rotateX);
    const deltaY = shortest(cur.rotateY, base.rotateY);
    if (deltaX === 0 && deltaY === 0) return;
    const retarget = {
      rotateX: cur.rotateX + deltaX,
      rotateY: cur.rotateY + deltaY,
    };
    rotationRef.current = retarget;
    // The roll already landed and the server value arrived late — snap
    // instantly instead of animating for 0.45s, which caused the visible
    // "extra spin"/flimmer after the dice appeared to stop.
    setSpinRotation({ ...retarget, snap: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayValue]);



  const handleToggle = () => {
    if (!canLock) return;
    onToggleLock();
    if ('vibrate' in navigator) {
      navigator.vibrate(5);
    }
  };

  // Fewer sparkles (5 instead of 8)
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
      aria-pressed={locked}
      aria-label={locked ? 'Lås upp tärning' : 'Lås tärning'}
      className={cn(
        'relative flex flex-col items-center overflow-visible touch-manipulation p-0 m-0 bg-transparent border-0 outline-none',
        canLock ? 'cursor-pointer' : 'cursor-default',
      )}
      style={{ width: size, height: size + 10, WebkitTapHighlightColor: 'transparent' }}
    >
      {/* Generous invisible hit area — the die grows to 108% when locked and
          sits inside a tilted wrapper, so taps near the edge used to miss. */}
      <span
        aria-hidden
        style={{ position: 'absolute', left: -10, right: -10, top: -10, bottom: -6, zIndex: 60 }}
      />

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
              border: '2px solid hsl(var(--game-gold))',
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

      {/* Soft gold halo behind the die when locked */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: '50%',
          top: -8,
          width: size + 22,
          height: size + 22,
          marginLeft: -(size + 22) / 2,
          borderRadius: '50%',
          background: 'radial-gradient(circle, hsl(var(--game-gold) / 0.28) 0%, hsl(var(--game-gold) / 0.10) 48%, hsl(var(--game-gold) / 0) 72%)',
          opacity: locked ? 1 : 0,
          transition: 'opacity 0.28s ease-out',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Selection ring is rendered inside the die wrapper so it scales with it */}


      {/* Outer wrapper — shadow and glow */}
      <div
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          position: 'relative',
          zIndex: 1,
          // Keep a stable compositor layer for the whole die. Toggling
          // will-change / animating `filter` per roll forced Safari to
          // re-rasterize the 3D subtree every frame → visible flimmer.
          // Locked dice grow slightly so the kept set reads instantly.
          transform: locked ? 'translateZ(0) scale(1.08)' : 'translateZ(0) scale(1)',
          transformOrigin: '50% 60%',
          boxShadow: locked
            ? '0 14px 24px -6px rgba(0,0,0,0.42), 0 5px 9px rgba(0,0,0,0.24), 0 0 14px hsl(var(--game-gold) / 0.28)'
            : '0 14px 24px -6px rgba(0,0,0,0.42), 0 5px 9px rgba(0,0,0,0.24)',
          // Keep the complete 3D subtree fully opaque at all times.
          transition: 'box-shadow 0.45s cubic-bezier(0.22, 1, 0.36, 1), transform 0.28s cubic-bezier(0.34, 1.4, 0.64, 1)',
          opacity: 1,
        }}
      >
        {/* Supersampled 3D stage: laid out at 2x, scaled to 1x for crisp edges.
            The downscale lives on this outer, non-3D wrapper so the perspective
            container itself is never inside an animating/scaled 3D chain —
            WebKit then rasterizes the cube at its full 2x layout size. */}
        <div
          style={{
            width: size,
            height: size,
            pointerEvents: 'none',
            position: 'relative',
            transform: `scale(${1 / SS})`,
            transformOrigin: '0 0',
            isolation: 'isolate',
          }}
        >
          <div
            style={{
              width: S,
              height: S,
              // Flatter perspective: less extreme foreshortening on the far
              // edge, so WebKit's single rasterization stretches much less
              // during the spin (that stretch is what read as blur).
              perspective: Math.round(S * 6.5),
              perspectiveOrigin: '50% 50%',
            }}
          >
            <motion.div
              className="relative"
              style={{
                width: S,
                height: S,
                transformStyle: 'preserve-3d',
                WebkitTransformStyle: 'preserve-3d',
                // Constant hint — toggling it mid-roll caused a layer swap flash.
                willChange: 'transform',
                backfaceVisibility: 'visible',
                // Push the cube back by half its depth so the FRONT face sits at
                // z = 0. Without this, perspective magnifies the visible face by
                // ~8%, which made the die spill outside the gold selection ring.
                z: -halfS,
              }}

              animate={{
                rotateX: spinRotation.rotateX,
                rotateY: spinRotation.rotateY,
              }}

              transition={
                isAnimating
                  ? {
                      rotateX: { duration: dur, ease: [0.16, 1, 0.3, 1] },
                      rotateY: { duration: dur, ease: [0.16, 1, 0.3, 1] },
                    }
                  : spinRotation.snap
                    ? { duration: 0 }
                    : { duration: 0.45, ease: [0.22, 1, 0.36, 1] }
              }
              onAnimationComplete={() => {
                // End the roll from the renderer's actual final frame rather
                // than a parallel 1500 ms JS timer.
                if (!rollingRef.current) return;
                rollingRef.current = false;
                setIsAnimating(false);
                playLandSound();
              }}
            >
              {/* Solid inner cube — fills the interior so the background never
                  shows through the gaps between the six rounded faces during
                  rotation. Six flat faces form a closed, slightly smaller cube
                  that sits just behind the outer faces and is tinted to match
                  the ivory body. */}
              {[
                { t: `translateZ(${halfS - 2}px)` },
                { t: `rotateY(180deg) translateZ(${halfS - 2}px)` },
                { t: `rotateY(-90deg) translateZ(${halfS - 2}px)` },
                { t: `rotateY(90deg) translateZ(${halfS - 2}px)` },
                { t: `rotateX(-90deg) translateZ(${halfS - 2}px)` },
                { t: `rotateX(90deg) translateZ(${halfS - 2}px)` },
              ].map((f, i) => (
                <div
                  key={`core-${i}`}
                  className="absolute"
                  style={{
                    top: 2, left: 2, width: S - 4, height: S - 4,
                    transform: f.t,
                    transformStyle: 'flat',
                    WebkitTransformStyle: 'flat',
                    background: 'linear-gradient(135deg, #f4eee2 0%, #e6dcc8 100%)',
                    pointerEvents: 'none',
                  }}
                />
              ))}
              {faces.map(f => (
                <div
                  key={f.v}
                  className="absolute"
                  style={{
                    // Exact-size faces: the previous 1px outward overlap made the
                    // bright face rim show as thin streaks across the die edges.
                    top: 0, left: 0, width: S, height: S,
                    transform: f.t,
                    // Faces are flat quads. Keeping `preserve-3d` here made
                    // WebKit re-evaluate a nested 3D context per face every frame.
                    transformStyle: 'flat',
                    WebkitTransformStyle: 'flat',
                    backfaceVisibility: 'hidden',
                    WebkitBackfaceVisibility: 'hidden',
                  }}
                >
                  <DiceFace faceValue={f.v} size={S} />
                </div>
              ))}
            </motion.div>
          </div>
        </div>

        {/* Selection ring — now that the front face sits exactly at z = 0 the
            die measures exactly `size`, so a tight, even 3px gap frames it
            perfectly on all four sides. */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: -3,
            left: -3,
            right: -3,
            bottom: -3,
            borderRadius: radius + 3,
            border: '1.5px solid hsl(var(--game-gold))',

            boxShadow: locked
              ? 'inset 0 0 0 1px hsl(var(--game-gold-dark) / 0.28), 0 0 9px hsl(var(--game-gold) / 0.42)'
              : 'none',
            opacity: locked ? 1 : 0,
            transition: 'opacity 0.22s ease-out',
            pointerEvents: 'none',
            zIndex: 5,
          }}
        />
      </div>



      {/* Ground shadow — pre-softened radial gradient, without CSS blur.
          WebKit may re-rasterize a filtered sibling on every 3D frame, which
          makes the die above it flash even though the shadow itself is static. */}

      <motion.div
        style={{
          width: size * 0.86,
          height: 9,
          marginTop: 3,
          borderRadius: '50%',
          pointerEvents: 'none',
          background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.42), rgba(0,0,0,0.15) 42%, rgba(0,0,0,0.04) 66%, transparent 82%)',
        }}
        animate={{
          scaleX: locked ? 1.08 : 1,
          opacity: 0.65,
        }}

        transition={{ duration: 0.3, ease: 'easeOut' }}

      />
    </button>
  );
}
