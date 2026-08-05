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

const DiceFace = memo(function DiceFace({ faceValue, size }: {
  faceValue: number;
  size: number;
}) {
  const radius = Math.round(size * 0.19);
  const pipSize = Math.round(size * 0.155);
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
        background: [
          // bright top-left specular highlight
          'radial-gradient(circle at 22% 18%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 46%)',
          // warm bounce light along the bottom-left edge
          'radial-gradient(circle at 12% 92%, rgba(255,246,225,0.6) 0%, rgba(255,246,225,0) 42%)',
          // bottom-right ambient occlusion / shaded face
          'radial-gradient(circle at 92% 94%, rgba(96,82,62,0.34) 0%, rgba(96,82,62,0) 68%)',
          // ivory body with directional gradient (lit from upper-left)
          'linear-gradient(135deg, #fffefb 0%, #fbf7ef 40%, #f0e9db 74%, #e5dcc9 100%)',
        ].join(', '),
        boxShadow: [
          // soft rounded-edge highlight (top-left)
          'inset 3px 3px 6px rgba(255,255,255,0.9)',
          // rounded-edge shadow (bottom-right) — 3D volume
          'inset -3px -3.5px 7px rgba(64,54,42,0.3)',
          // thin bevel rim
          'inset 0 0 0 1px rgba(255,255,255,0.7)',
        ].join(', '),
        pointerEvents: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        // No `overflow: hidden` — a rounded clip inside a rotating 3D context
        // forces WebKit to re-rasterize the face on every frame (flimmer).
      }}
    >
      {/* Glossy top sheen — subtle */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: radius,
          background:
            'linear-gradient(152deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.1) 30%, rgba(255,255,255,0) 48%)',
          pointerEvents: 'none',
        }}
      />

      {positions.map(i => {
        const [cx, cy] = PIP_COORDS[i];
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${cx}%`,
              top: `${cy}%`,
              width: pipSize,
              height: pipSize,
              marginLeft: -pipSize / 2,
              marginTop: -pipSize / 2,
              borderRadius: '50%',
              // Deep drilled pip with a faint specular kick at bottom-right
              background:
                'radial-gradient(circle at 66% 72%, #2b2721 0%, #0c0b09 44%, #000 100%)',
              boxShadow: [
                // recess shadow (top-left dark rim sells the depth)
                `inset ${size * 0.02}px ${size * 0.024}px ${size * 0.035}px rgba(0,0,0,0.9)`,
                // bottom-right highlight rim — light bouncing off recess edge
                `inset -${size * 0.01}px -${size * 0.014}px ${size * 0.02}px rgba(255,255,255,0.26)`,
                // soft cast shadow on die surface around the pip
                `0 ${size * 0.014}px ${size * 0.024}px rgba(0,0,0,0.35)`,
                // bright rim above the hole = carved, not painted
                `0 -${size * 0.006}px 0 rgba(255,255,255,0.6)`,
              ].join(', '),
            }}
          />
        );
      })}
    </div>
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

      {/* Soft gold halo behind the die when locked (no hard border box) */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: '50%',
          top: -6,
          width: size + 12,
          height: size + 12,
          marginLeft: -(size + 12) / 2,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(245,185,66,0.30) 0%, rgba(245,185,66,0.12) 45%, rgba(245,185,66,0) 70%)',
          opacity: locked ? 1 : 0,
          transition: 'opacity 0.3s ease-out',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />


      {/* Outer wrapper — shadow and glow + crisp 1px edge highlight */}
      <div

        style={{
          width: size,
          height: size,
          borderRadius: radius,
          // Keep a stable compositor layer for the whole die. Toggling
          // will-change / animating `filter` per roll forced Safari to
          // re-rasterize the 3D subtree every frame → visible flimmer.
          // Locked dice grow slightly so the kept set reads instantly.
          transform: locked ? 'translateZ(0) scale(1.08)' : 'translateZ(0) scale(1)',
          transformOrigin: '50% 60%',
          boxShadow: locked
            ? '0 0 0 3px hsl(42 95% 66%), 0 0 0 5px hsl(34 80% 46%), 0 0 18px rgba(245,185,66,0.55), 0 14px 24px -6px rgba(0,0,0,0.42), 0 5px 9px rgba(0,0,0,0.24), inset 0 0 0 1px rgba(255,255,255,0.45)'
            : '0 14px 24px -6px rgba(0,0,0,0.42), 0 5px 9px rgba(0,0,0,0.24), 0 1px 0 rgba(255,255,255,0.28), inset 0 0 0 1px rgba(255,255,255,0.45)',

          // Keep the complete 3D subtree fully opaque at all times. Previously
          // every unlocked die faded from 1 → 0.5 at the exact frame rolling
          // ended (because canLock changed). On WebKit that opacity transition
          // also rebuilt the composited 3D layer, producing a strong flash.
          transition: 'box-shadow 0.45s cubic-bezier(0.22, 1, 0.36, 1), transform 0.28s cubic-bezier(0.34, 1.4, 0.64, 1)',
          opacity: 1,
        }}
      >
        <div style={{ perspective: Math.round(size * 4.3), width: size, height: size, pointerEvents: 'none' }}>
          <motion.div
            className="relative"
            style={{
              width: size,
              height: size,
              transformStyle: 'preserve-3d',
              WebkitTransformStyle: 'preserve-3d',
              // Constant hint — toggling it mid-roll caused a layer swap flash.
              willChange: 'transform',
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
              // than a parallel 1500 ms JS timer. Safari can commit that timer
              // one frame before Framer Motion finishes, which swaps transition
              // modes mid-frame and shows as a small flash at landing.
              if (!rollingRef.current) return;
              rollingRef.current = false;
              setIsAnimating(false);
              playLandSound();
            }}

          >
            {/* Solid inner core planes — fill the corner/edge gaps that appear
                between the six rounded faces when the die is seen at ~90°. */}
            {['translateZ(0px)', 'rotateY(90deg)', 'rotateX(90deg)'].map(t => (
              <div
                key={`core-${t}`}
                className="absolute inset-0"
                style={{
                  transform: t,
                  transformStyle: 'flat',
                  WebkitTransformStyle: 'flat',
                  borderRadius: Math.round(size * 0.12),
                  background: 'linear-gradient(135deg, #f6f1e6 0%, #e6dcc8 100%)',
                  pointerEvents: 'none',
                }}
              />
            ))}
            {faces.map(f => (
              <div
                key={f.v}
                className="absolute"
                style={{
                  // 1px outward overlap on each side closes the hairline seams
                  // where two rounded faces meet at a right angle.
                  top: -1, left: -1, width: size + 2, height: size + 2,
                  transform: f.t,
                  // Faces are flat quads. Keeping `preserve-3d` here made
                  // WebKit re-evaluate a nested 3D context per face every
                  // frame, which is what still produced the flimmer.
                  transformStyle: 'flat',
                  WebkitTransformStyle: 'flat',
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                }}
              >
                <DiceFace faceValue={f.v} size={size + 2} />
              </div>
            ))}


          </motion.div>
        </div>
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
