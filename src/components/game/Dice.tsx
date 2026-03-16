import { useState, useEffect, useMemo, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { playLandSound } from '@/lib/dice-sounds';

interface DiceProps {
  value: number;
  locked: boolean;
  rolling: boolean;
  onToggleLock: () => void;
  canLock: boolean;
}

const pipGridPositions: Record<number, number[]> = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 4, 7, 3, 6, 9],
};

const valueToRotation: Record<number, { rotateX: number; rotateY: number }> = {
  1: { rotateX: 0, rotateY: 0 },
  2: { rotateX: 0, rotateY: 90 },
  3: { rotateX: 90, rotateY: 0 },
  4: { rotateX: -90, rotateY: 0 },
  5: { rotateX: 0, rotateY: -90 },
  6: { rotateX: 0, rotateY: 180 },
};

const SIZE = 56;
const HALF = SIZE / 2;
const RADIUS = 12;
const PIP_COLOR = '#1a2428';
const ANIM_DURATION = 0.8;
const PIP_CLASS = 'dice-pip';

// Pre-compute face transforms (static)
const FACES = [
  { v: 1, t: `translateZ(${HALF}px)` },
  { v: 6, t: `rotateY(180deg) translateZ(${HALF}px)` },
  { v: 2, t: `rotateY(-90deg) translateZ(${HALF}px)` },
  { v: 5, t: `rotateY(90deg) translateZ(${HALF}px)` },
  { v: 3, t: `rotateX(-90deg) translateZ(${HALF}px)` },
  { v: 4, t: `rotateX(90deg) translateZ(${HALF}px)` },
];

const Pip = memo(function Pip() {
  return (
    <div
      className={PIP_CLASS}
      style={{
        width: 10,
        height: 10,
        minWidth: 10,
        minHeight: 10,
        maxWidth: 10,
        maxHeight: 10,
        borderRadius: 9999,
        backgroundColor: PIP_COLOR,
        boxShadow: '0 0.5px 1px rgba(0,0,0,0.15)',
      }}
    />
  );
});

// Memoized face component — never re-renders since faceValue is static per instance
const DiceFace = memo(function DiceFace({ faceValue }: { faceValue: number }) {
  const positions = new Set(pipGridPositions[faceValue] || []);

  return (
    <div
      style={{
        position: 'absolute',
        width: SIZE,
        height: SIZE,
        borderRadius: RADIUS,
        background: 'linear-gradient(180deg, #ffffff 0%, #f2f4f6 100%)',
        border: '1px solid rgba(0,0,0,0.05)',
        boxShadow: 'inset 1px 1px 3px rgba(255,255,255,0.8), inset -1px -1px 2px rgba(0,0,0,0.02)',
        backfaceVisibility: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: '12.5%',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gridTemplateRows: 'repeat(3, minmax(0, 1fr))',
        }}
      >
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {positions.has(i + 1) ? <Pip /> : null}
          </div>
        ))}
      </div>
    </div>
  );
});

export function Dice({ value, locked, rolling, onToggleLock, canLock }: DiceProps) {
  const [isAnimating, setIsAnimating] = useState(false);
  const [spinRotation, setSpinRotation] = useState(valueToRotation[value]);
  const [showSparkle, setShowSparkle] = useState(false);
  const prevLockedRef = useRef(locked);
  const rollingRef = useRef(false);

  const rollVar = useMemo(() => ({
    spinsX: (2 + Math.floor(Math.random() * 2)) * 360,
    spinsY: (2 + Math.floor(Math.random() * 2)) * 360,
    dt: (Math.random() - 0.5) * 0.1,
    bounceY: -5 - Math.random() * 6,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [rolling, value]);

  const dur = ANIM_DURATION + rollVar.dt;

  const target = useMemo(() => {
    const b = valueToRotation[value];
    return { rotateX: b.rotateX + rollVar.spinsX, rotateY: b.rotateY + rollVar.spinsY };
  }, [value, rollVar]);

  useEffect(() => {
    if (rolling && !locked && !rollingRef.current) {
      rollingRef.current = true;
      setIsAnimating(true);
      setSpinRotation(target);
      const t = setTimeout(() => {
        setIsAnimating(false);
        rollingRef.current = false;
        setSpinRotation(valueToRotation[value]);
        playLandSound();
      }, dur * 1000);
      return () => clearTimeout(t);
    } else if (!rolling) {
      rollingRef.current = false;
      setSpinRotation(valueToRotation[value]);
    }
  }, [rolling, value, locked, target, dur]);

  useEffect(() => {
    if (locked && !prevLockedRef.current) {
      setShowSparkle(true);
      const t = setTimeout(() => setShowSparkle(false), 600);
      return () => clearTimeout(t);
    }
    prevLockedRef.current = locked;
  }, [locked]);

  const handleToggle = () => {
    if (!canLock) return;
    onToggleLock();
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
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
    <div className="relative flex flex-col items-center overflow-visible touch-manipulation" style={{ width: SIZE + 10, height: SIZE + 16 }}>
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
              width: SIZE + 10, height: SIZE + 10, borderRadius: RADIUS + 5,
              border: '2px solid hsl(36 82% 52%)',
              left: '50%', top: HALF,
              marginLeft: -(SIZE + 10) / 2, marginTop: -(SIZE + 10) / 2, zIndex: 49,
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
          width: SIZE,
          height: SIZE,
          borderRadius: RADIUS,
          willChange: 'auto',
          boxShadow: locked
            ? '0 0 0 2.5px hsl(36 72% 50%), 0 0 18px rgba(245,185,66,0.3), 0 6px 14px rgba(0,0,0,0.18)'
            : '0 6px 14px rgba(0,0,0,0.18)',
          transition: 'box-shadow 0.3s ease, opacity 0.3s ease',
          opacity: canLock && !locked ? 0.5 : 1,
        }}
      >
        <div style={{ perspective: 240, width: SIZE, height: SIZE }}>
          <motion.button
            onClick={handleToggle}
            className={cn('relative touch-manipulation', canLock ? 'cursor-pointer' : 'cursor-default')}
            style={{
              width: SIZE,
              height: SIZE,
              transformStyle: 'preserve-3d',
              willChange: isAnimating ? 'transform' : 'auto',
              WebkitTapHighlightColor: 'transparent',
            }}
            animate={{
              rotateX: spinRotation.rotateX,
              rotateY: spinRotation.rotateY,
              y: isAnimating ? [0, rollVar.bounceY, 2, -1, 0] : 0,
            }}
            transition={
              isAnimating
                ? {
                    rotateX: { duration: dur, ease: [0.15, 0.85, 0.25, 1] },
                    rotateY: { duration: dur, ease: [0.15, 0.85, 0.25, 1] },
                    y: { duration: dur, times: [0, 0.55, 0.75, 0.9, 1], ease: 'easeOut' },
                  }
                : { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }
            }
            
          >
            {FACES.map(f => (
              <div key={f.v} className="absolute inset-0" style={{ transform: f.t, transformStyle: 'preserve-3d' }}>
                <DiceFace faceValue={f.v} />
              </div>
            ))}
          </motion.button>
        </div>
      </motion.div>

      {/* Ground shadow */}
      <motion.div
        style={{
          width: SIZE * 0.55, height: 5, marginTop: 5, borderRadius: '50%',
          background: locked
            ? 'radial-gradient(ellipse, rgba(245,185,66,0.3), transparent)'
            : 'radial-gradient(ellipse, rgba(0,0,0,0.22), transparent)',
        }}
        animate={{
          scaleX: isAnimating ? [1, 0.6, 1.15, 0.95, 1] : locked ? 1.1 : 1,
          opacity: isAnimating ? [0.5, 0.15, 0.5, 0.45, 0.5] : 0.5,
        }}
        transition={
          isAnimating
            ? { duration: dur, times: [0, 0.55, 0.75, 0.9, 1], ease: 'easeOut' }
            : { duration: 0.3, ease: 'easeOut' }
        }
      />
    </div>
  );
}
