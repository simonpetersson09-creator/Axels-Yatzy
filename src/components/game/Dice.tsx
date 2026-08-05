import { useState, useEffect, useMemo, useRef, memo, forwardRef } from 'react';
import { motion, AnimatePresence, useAnimationControls } from 'framer-motion';
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
/**
 * Shared gradient definitions. Previously every single face SVG carried its own
 * <defs> block (5 dice × 15 layers × 10 gradients ≈ 750 gradient nodes), which
 * WKWebView re-parses and re-rasterizes constantly. They are now declared once
 * for the whole document; the `url(#…)` references are unchanged.
 */
export function DiceGradientDefs() {
  return (
    <svg
      aria-hidden
      width="0"
      height="0"
      style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}
    >
      <defs>
        {/* Cool porcelain body: very soft, diffuse shading with no harsh warm tones */}
        <linearGradient id="dfBody" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="hsl(var(--dice-ivory))" />
          <stop offset="40%" stopColor="hsl(var(--dice-ivory-mid))" />
          <stop offset="100%" stopColor="hsl(var(--dice-ivory-shade))" />
        </linearGradient>

        {/* Soft ambient occlusion for porcelain — cool and barely visible */}
        <radialGradient id="dfAo" cx="0.88" cy="0.90" r="0.85">
          <stop offset="0%" stopColor="hsl(var(--dice-edge-dark))" stopOpacity="0.10" />
          <stop offset="100%" stopColor="hsl(var(--dice-edge-dark))" stopOpacity="0" />
        </radialGradient>

        {/* Soft bevel shadow for matte porcelain */}
        <linearGradient id="dfBevelDark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="hsl(var(--dice-edge-dark))" stopOpacity="0" />
          <stop offset="60%" stopColor="hsl(var(--dice-edge-dark))" stopOpacity="0.08" />
          <stop offset="100%" stopColor="hsl(var(--dice-edge-dark))" stopOpacity="0.22" />
        </linearGradient>

        {/* Pip: soft matte dark hole */}
        <radialGradient id="dfPip" cx="0.60" cy="0.68" r="0.85">
          <stop offset="0%" stopColor="hsl(var(--dice-pip))" />
          <stop offset="50%" stopColor="hsl(var(--dice-pip))" />
          <stop offset="100%" stopColor="hsl(var(--dice-pip-rim))" />
        </radialGradient>

        {/* Pip inner shadow: shallow, matte indentation */}
        <radialGradient id="dfPipInner" cx="0.38" cy="0.38" r="0.65">
          <stop offset="0%" stopColor="black" stopOpacity="0.32" />
          <stop offset="60%" stopColor="black" stopOpacity="0.12" />
          <stop offset="100%" stopColor="black" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

const DiceFace = memo(function DiceFace({ faceValue, size, simple = false }: {
  faceValue: number;
  size: number;
  /** While the cube spins the fine shading layers are invisible anyway, so we
   *  drop them — that halves the number of painted layers per frame on iOS. */
  simple?: boolean;
}) {
  const radius = size * 0.22;
  const r = 22; // corner radius in viewBox units
  const pipR = 7.5; // pip radius in viewBox units
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
      {/* Base ivory body */}
      <rect x="0" y="0" width="100" height="100" rx={r} ry={r} fill="url(#dfBody)" />

      {!simple && (
        <>
          {/* Ambient occlusion darkening the bottom-right corner */}
          <rect x="0" y="0" width="100" height="100" rx={r} ry={r} fill="url(#dfAo)" />

          {/* Bottom/right bevel shadow */}
          <rect
            x="1.4" y="1.4" width="97.2" height="97.2"
            rx={r - 1.4} ry={r - 1.4}
            fill="none" stroke="url(#dfBevelDark)" strokeWidth="2.8"
          />
        </>
      )}

      {/* Pips */}
      {positions.map(i => {
        const [cx, cy] = PIP_COORDS[i];
        return simple ? (
          <circle key={i} cx={cx} cy={cy} r={pipR} fill="url(#dfPip)" />
        ) : (
          <g key={i}>
            {/* Inner shadow that makes the pip look carved in */}
            <circle cx={cx} cy={cy} r={pipR + 0.1} fill="url(#dfPipInner)" />
            {/* Pip face */}
            <circle cx={cx} cy={cy} r={pipR} fill="url(#dfPip)" />
          </g>
        );
      })}
    </svg>
  );
});







export const Dice = memo(forwardRef<HTMLButtonElement, DiceProps>(function Dice({
  value, locked, rolling, onToggleLock, canLock, size = 56, hasRolled = true,
}, ref) {
  const initialFace = useMemo(() => 1 + Math.floor(Math.random() * 6), []);
  const displayValue = hasRolled ? value : initialFace;

  const [isAnimating, setIsAnimating] = useState(false);
  // `snap` lives in state (not a ref mutated during render) so the transition
  // is a pure function of state — a stray re-render can no longer consume the
  // snap flag and leave a 0.45s glide after landing (visible as flimmer).
  const [spinRotation, setSpinRotation] = useState({ ...valueToRotation[displayValue], snap: false });
  const [showSparkle, setShowSparkle] = useState(false);
  // Bumped when a roll finishes — replays the landing bounce.
  const [landKey, setLandKey] = useState(0);
  // Landing bounce is driven by imperative controls instead of a `key` remount:
  // remounting re-created the whole 3D cube (15 layers) on every landing, which
  // caused a visible stall on iOS.
  const bounceControls = useAnimationControls();
  useEffect(() => {
    if (landKey === 0) return;
    void bounceControls.start(
      { y: [-7, 2, -1, 0], scaleY: [1, 0.9, 1.03, 1], scaleX: [1, 1.08, 0.98, 1] },
      { duration: 0.36, times: [0, 0.35, 0.65, 1], ease: 'easeOut' },
    );
  }, [landKey, bounceControls]);

  const prevLockedRef = useRef(locked);
  const rollingRef = useRef(false);
  // Turn hand-over: dice roll back to their neutral state instead of just
  // swapping pips.
  const [isResetting, setIsResetting] = useState(false);
  const resettingRef = useRef(false);
  const prevHasRolledRef = useRef(hasRolled);
  const rotationRef = useRef(valueToRotation[displayValue]);
  // Always-current value, so effects/callbacks that intentionally skip
  // `displayValue` in their deps never act on a stale face.
  const displayValueRef = useRef(displayValue);
  displayValueRef.current = displayValue;
  // Snap ("duration 0") is carried on the rotation state itself — see above.

  const half = size / 2;
  const radius = Math.round(size * 0.22);
  // Supersampling: build the cube at 2x and scale it down. WebKit rasterizes
  // a 3D subtree once at its layout size, so rendering at 2x removes the
  // pixelated/aliased edges and pips on retina screens. (3x was tested and
  // looked worse — the extra layer size made WebKit downgrade rasterization.)
  const SS = 1.5;
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
      // A new roll always wins over an in-flight turn-hand-over rewind.
      if (resettingRef.current) {
        resettingRef.current = false;
        setIsResetting(false);
      }
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
    // Track hand-over state even while a roll is in flight, so the rewind
    // still triggers on the next turn change.
    const wasRolled = prevHasRolledRef.current;
    prevHasRolledRef.current = hasRolled;
    if (rollingRef.current) return;
    const base = valueToRotation[displayValue];
    const cur = rotationRef.current;
    const mod = (n: number) => ((n % 360) + 360) % 360;

    // Turn hand-over (hasRolled true -> false): roll the die backwards one
    // full revolution into its neutral face instead of snapping the pips.
    if (wasRolled && !hasRolled) {
      const rewind = {
        rotateX: cur.rotateX - 360 - mod(cur.rotateX - base.rotateX),
        rotateY: cur.rotateY - 360 - mod(cur.rotateY - base.rotateY),
      };
      rotationRef.current = rewind;
      resettingRef.current = true;
      setIsResetting(true);
      setSpinRotation({ ...rewind, snap: false });
      return;
    }

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
  }, [displayValue, hasRolled]);



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
      ref={ref}
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


      {/* Landing bounce — the whole die body drops, squashes against the felt
          and settles back when a roll finishes. */}
      <motion.div
        style={{ position: 'relative', zIndex: 1, transformOrigin: '50% 100%' }}
        initial={false}
        animate={bounceControls}
      >

      {/* Outer wrapper — tactile die body, ground shadow and glow */}
      <div
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          position: 'relative',
          zIndex: 1,
          // Locked dice grow slightly so the kept set reads instantly.
          transform: locked ? 'translateZ(0) scale(1.08)' : 'translateZ(0) scale(1)',
          transformOrigin: '50% 60%',
          // Stacked shadows simulate the thickness of the die sitting on the
          // felt, then a soft drop shadow anchors it to the surface.
          boxShadow: locked
            ? '1px 1px 0 rgba(0,0,0,0.06), 2px 2px 0 rgba(0,0,0,0.05), 3px 3px 0 rgba(0,0,0,0.04), 4px 4px 0 rgba(0,0,0,0.03), 0 14px 24px -6px rgba(0,0,0,0.42), 0 5px 9px rgba(0,0,0,0.24), 0 0 14px hsl(var(--game-gold) / 0.28)'
            : '1px 1px 0 rgba(0,0,0,0.06), 2px 2px 0 rgba(0,0,0,0.05), 3px 3px 0 rgba(0,0,0,0.04), 4px 4px 0 rgba(0,0,0,0.03), 0 14px 24px -6px rgba(0,0,0,0.42), 0 5px 9px rgba(0,0,0,0.24)',
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
              initial={false}
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
                  : isResetting
                    ? { duration: 0.85, ease: [0.33, 1, 0.68, 1] }
                    : spinRotation.snap
                      ? { duration: 0 }
                      : { duration: 0.45, ease: [0.22, 1, 0.36, 1] }
              }
              onAnimationComplete={() => {
                if (resettingRef.current) {
                  // Turn hand-over rewind finished — no landing bounce/sound.
                  resettingRef.current = false;
                  setIsResetting(false);
                  return;
                }
                // End the roll from the renderer's actual final frame rather
                // than a parallel 1500 ms JS timer.
                if (!rollingRef.current) return;
                rollingRef.current = false;
                setIsAnimating(false);
                // Safety net: if the authoritative value arrived while the
                // spin was in flight (the value effect bails out during a
                // roll), snap to the correct face now so a die can never
                // stay stuck on a stale number.
                {
                  const base = valueToRotation[displayValueRef.current];
                  const cur = rotationRef.current;
                  const mod = (n: number) => ((n % 360) + 360) % 360;
                  const short = (from: number, to: number) => {
                    const d = ((to - mod(from)) % 360 + 540) % 360 - 180;
                    return d === -180 ? 180 : d;
                  };
                  const dX = short(cur.rotateX, base.rotateX);
                  const dY = short(cur.rotateY, base.rotateY);
                  if (dX !== 0 || dY !== 0) {
                    const fixed = { rotateX: cur.rotateX + dX, rotateY: cur.rotateY + dY };
                    rotationRef.current = fixed;
                    setSpinRotation({ ...fixed, snap: true });
                  }
                }
                playLandSound();
                // Trigger the landing bounce on the die body.
                setLandKey((k) => k + 1);
              }}
            >
              {/* Solid inner core planes — fill the corner gaps between the six
                  rounded faces. Matte ivory (no bright rim) so they never read
                  as a light streak across the die. */}
              {/* Three orthogonal core planes, plus offset copies pushed toward each
                  face, so the rounded corners never let the background show through
                  while the cube spins. */}
              {['translateZ(0px)', 'rotateY(90deg)', 'rotateX(90deg)'].map(t => (
                <div
                  key={`core-${t}`}
                  className="absolute"
                  style={{
                    // Keep the core just inside the six visible faces so Safari
                    // never draws plane intersections through the front face.
                    top: 4, left: 4, width: S - 8, height: S - 8,
                    transform: t,
                    transformStyle: 'flat',
                    WebkitTransformStyle: 'flat',
                    borderRadius: Math.round(S * 0.19),
                    background: 'linear-gradient(135deg, hsl(220 14% 98%) 0%, hsl(220 8% 90%) 100%)',
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
                  <DiceFace faceValue={f.v} size={S} simple={isAnimating || isResetting} />
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
      </motion.div>



      {/* Ground shadow — soft felt indentation under the die.
          While rolling the die reads as airborne: the shadow spreads out and
          fades. On landing it snaps in tight and dark, then eases back to
          rest — that momentary compression is the felt contact. */}
      <motion.div
        style={{
          width: size * 0.92,
          height: 10,
          marginTop: 4,
          borderRadius: '50%',
          pointerEvents: 'none',
          background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.2) 38%, rgba(0,0,0,0.06) 68%, transparent 88%)',
          filter: 'blur(1px)',
        }}
        initial={false}
        animate={
          rolling
            ? { scaleX: 1.22, scaleY: 0.7, opacity: 0.3 }
            : landKey > 0
              ? {
                  scaleX: locked ? [1.24, 0.94, 1.08] : [1.24, 0.86, 1],
                  scaleY: [0.68, 1.18, 1],
                  opacity: [0.34, 0.9, 0.72],
                }
              : {
                  scaleX: locked ? 1.08 : 1,
                  scaleY: 1,
                  opacity: 0.72,
                }
        }

        transition={
          rolling
            ? { duration: 0.25, ease: 'easeOut' }
            : { duration: 0.42, times: [0, 0.32, 1], ease: 'easeOut' }
        }
      />


    </button>
  );
}));
