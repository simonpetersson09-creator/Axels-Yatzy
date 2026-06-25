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
}


const valueToRotation: Record<number, { rotateX: number; rotateY: number }> = {
  1: { rotateX: 0, rotateY: 0 },
  2: { rotateX: 0, rotateY: 90 },
  3: { rotateX: 90, rotateY: 0 },
  4: { rotateX: -90, rotateY: 0 },
  5: { rotateX: 0, rotateY: -90 },
  6: { rotateX: 0, rotateY: 180 },
};

const ANIM_DURATION = 1.35;

// Pure CSS ivory die face with deep black pips — premium 3D look, no pre-rendered art.
const DiceFace = memo(function DiceFace({ faceValue, size }: {
  faceValue: number;
  size: number;
}) {
  const radius = Math.round(size * 0.2);
  const pipSize = Math.max(6, Math.round(size * 0.17));
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
        background: [
          // bright top-left specular highlight
          'radial-gradient(circle at 20% 15%, rgba(255,255,255,1) 0%, rgba(255,255,255,0) 50%)',
          // bottom-right ambient occlusion / shaded face
          'radial-gradient(circle at 92% 95%, rgba(120,108,92,0.30) 0%, rgba(120,108,92,0) 60%)',
          // ivory body with directional gradient (lit from upper-left)
          'linear-gradient(135deg, #fdfcf7 0%, #f6f1e6 45%, #ddd4c0 100%)',
        ].join(', '),
        boxShadow: [
          // bright bevel highlight (top-left)
          'inset 2.5px 2.5px 3px rgba(255,255,255,0.95)',
          // deeper bevel shadow (bottom-right) — sells the rounded edge
          'inset -2.5px -3px 4px rgba(80,70,55,0.28)',
          // crisp white rim to keep corners bright (matches reference)
          'inset 0 0 0 1px rgba(255,255,255,0.9)',
        ].join(', '),
        pointerEvents: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        overflow: 'hidden',
      }}
    >
      {/* Glossy top sheen — subtle */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: radius,
          background:
            'linear-gradient(160deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0) 40%)',
          pointerEvents: 'none',
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
                    // Solid black pip (no transparency in color)
                    background: '#000',
                    boxShadow: [
                      // strong recess shadow (top-left dark rim sells the depth)
                      'inset 2px 2.5px 3px rgba(0,0,0,0.9)',
                      // bottom-right highlight rim — light bouncing off recess edge
                      'inset -1px -1.5px 1.5px rgba(255,255,255,0.22)',
                      // soft cast shadow on die surface around the pip
                      '0 1.5px 2px rgba(0,0,0,0.45)',
                      // tiny outer ring for contact definition
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
  const half = size / 2;
  const radius = Math.round(size * 0.24);
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
    dt: (Math.random() - 0.5) * 0.1,
    bounceY: -4 - Math.random() * 4,
  });
  const rollVarRef = useRef(makeRollVar());
  const [rollVar, setRollVar] = useState(rollVarRef.current);
  // Per-die resting tilt — slight randomisation so dice in a row don't look mechanically identical.
  const restTilt = useRef({
    tx: (Math.random() - 0.5) * 8, // ±4°
    ty: (Math.random() - 0.5) * 10, // ±5°
    tz: (Math.random() - 0.5) * 12, // ±6°
  }).current;


  const dur = ANIM_DURATION + rollVar.dt;

  useEffect(() => {
    if (rolling && !locked && !rollingRef.current) {
      rollingRef.current = true;
      // Freeze a new set of random seeds for this roll only — prevents
      // re-randomization mid-animation that caused a visible second "settle" spin.
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

  // Re-sync rotation when `value` changes (incl. mid-spin). Without this the
  // dice keeps spinning toward the OLD target if the authoritative server
  // dice land after the local animation started — user sees stale faces
  // (e.g. all 1s after the first roll, or wrong pips when scoring).
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

      {/* Outer wrapper — shadow and glow */}
      <motion.div
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          willChange: 'auto',
          boxShadow: locked
            ? '0 0 0 2.5px hsl(36 72% 50%), 0 0 18px rgba(245,185,66,0.3), 0 10px 18px -4px rgba(0,0,0,0.32), 0 3px 6px rgba(0,0,0,0.18)'
            : '0 10px 18px -4px rgba(0,0,0,0.32), 0 3px 6px rgba(0,0,0,0.18)',
          transition: 'box-shadow 0.45s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.45s cubic-bezier(0.22, 1, 0.36, 1)',
          opacity: canLock && !locked ? 0.5 : 1,
        }}
      >
        <div style={{ perspective: Math.round(size * 4.3), width: size, height: size, pointerEvents: 'none' }}>
          {/* Permanent tilt with per-die randomised lean — reveals two side faces (premium 3D-rendered look) */}
          <div
            style={{
              width: size,
              height: size,
              transformStyle: 'preserve-3d',
              transform: `rotateX(${-18 + restTilt.tx}deg) rotateY(${22 + restTilt.ty}deg) rotateZ(${restTilt.tz}deg)`,
            }}
          >

            <motion.div
              className="relative"
              style={{
                width: size,
                height: size,
                transformStyle: 'preserve-3d',
                willChange: isAnimating ? 'transform' : 'auto',
              }}
              animate={{
                rotateX: spinRotation.rotateX,
                rotateY: spinRotation.rotateY,
                y: isAnimating ? [0, rollVar.bounceY, 2, -1, 0] : 0,
              }}
              transition={
                isAnimating
                  ? {
                      rotateX: { duration: dur, ease: [0.16, 1, 0.3, 1] },
                      rotateY: { duration: dur, ease: [0.16, 1, 0.3, 1] },
                      y: { duration: dur, times: [0, 0.55, 0.78, 0.92, 1], ease: [0.22, 1, 0.36, 1] },
                    }
                  : { duration: 0.45, ease: [0.22, 1, 0.36, 1] }
              }
            >
              {faces.map(f => (
                <div key={f.v} className="absolute inset-0" style={{ transform: f.t, transformStyle: 'preserve-3d' }}>
                  <DiceFace faceValue={f.v} size={size} />
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </motion.div>

      {/* Ground shadow — bigger, softer, with blur for a premium "resting on felt" look */}
      <motion.div
        style={{
          width: size * 0.78,
          height: 7,
          marginTop: 4,
          borderRadius: '50%',
          pointerEvents: 'none',
          filter: 'blur(2.5px)',
          background: locked
            ? 'radial-gradient(ellipse, rgba(245,185,66,0.35), rgba(245,185,66,0.08) 55%, transparent 75%)'
            : 'radial-gradient(ellipse, rgba(0,0,0,0.32), rgba(0,0,0,0.10) 55%, transparent 75%)',
        }}
        animate={{
          scaleX: isAnimating ? [1, 0.65, 1.12, 0.97, 1] : locked ? 1.08 : 1,
          opacity: isAnimating ? [0.55, 0.2, 0.55, 0.5, 0.55] : 0.55,
        }}
        transition={
          isAnimating
            ? { duration: dur, times: [0, 0.55, 0.75, 0.9, 1], ease: 'easeOut' }
            : { duration: 0.3, ease: 'easeOut' }
        }
      />
    </button>
  );
}
