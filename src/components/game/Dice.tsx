import { useState, useEffect, useMemo, useRef } from 'react';
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
  2: [3, 7],
  3: [3, 5, 7],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

const valueToRotation: Record<number, { rotateX: number; rotateY: number }> = {
  1: { rotateX: 0, rotateY: 0 },
  2: { rotateX: 0, rotateY: 90 },
  3: { rotateX: 90, rotateY: 0 },
  4: { rotateX: -90, rotateY: 0 },
  5: { rotateX: 0, rotateY: -90 },
  6: { rotateX: 0, rotateY: 180 },
};

const SIZE = 60;
const RADIUS = 12;
const PIP_SIZE = 9;
const PIP_COLOR = '#2f3a40';
const ANIM_DURATION = 0.8;

function DiceFace({ faceValue }: { faceValue: number }) {
  const positions = pipGridPositions[faceValue] || [];
  const pad = 12;

  return (
    <div
      className="absolute"
      style={{
        width: SIZE,
        height: SIZE,
        borderRadius: RADIUS,
        background: 'linear-gradient(180deg, #ffffff 0%, #f1f3f4 100%)',
        // Subtle top-left highlight + soft bottom shadow for 3D feel
        boxShadow: `
          inset 1px 1px 2px rgba(255,255,255,0.9),
          inset -1px -1px 2px rgba(0,0,0,0.03)
        `,
        backfaceVisibility: 'hidden',
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gridTemplateRows: 'repeat(3, 1fr)',
        padding: pad,
      }}
    >
      {Array.from({ length: 9 }, (_, i) => {
        const hasPip = positions.includes(i + 1);
        return (
          <div key={i} className="flex items-center justify-center">
            {hasPip && (
              <div
                style={{
                  width: PIP_SIZE,
                  height: PIP_SIZE,
                  borderRadius: '50%',
                  backgroundColor: PIP_COLOR,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function Dice({ value, locked, rolling, onToggleLock, canLock }: DiceProps) {
  const half = SIZE / 2;
  const [isAnimating, setIsAnimating] = useState(false);
  const [spinRotation, setSpinRotation] = useState({ rotateX: 0, rotateY: 0 });
  const [justToggled, setJustToggled] = useState(false);
  const [rollKey, setRollKey] = useState(0);

  // Variation per roll
  const rollVar = useMemo(() => ({
    spinsX: (Math.floor(Math.random() * 2) + 2) * 360,
    spinsY: (Math.floor(Math.random() * 2) + 2) * 360,
    dtOffset: (Math.random() - 0.5) * 0.1,
    bounceY: -6 - Math.random() * 5,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [rolling, value]);

  const animDur = ANIM_DURATION + rollVar.dtOffset;

  const targetRotation = useMemo(() => {
    const base = valueToRotation[value];
    return { rotateX: base.rotateX + rollVar.spinsX, rotateY: base.rotateY + rollVar.spinsY };
  }, [value, rollVar]);

  useEffect(() => {
    if (rolling && !locked) {
      setRollKey(k => k + 1);
      setIsAnimating(true);
      setSpinRotation(targetRotation);
      const timer = setTimeout(() => {
        setIsAnimating(false);
        setSpinRotation(valueToRotation[value]);
        playLandSound();
      }, animDur * 1000);
      return () => clearTimeout(timer);
    } else if (!rolling) {
      setSpinRotation(valueToRotation[value]);
    }
  }, [rolling, value, locked, targetRotation, animDur]);

  // Lock sparkle
  const [showSparkle, setShowSparkle] = useState(false);
  const prevLockedRef = useRef(locked);
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
    setJustToggled(true);
    onToggleLock();
    setTimeout(() => setJustToggled(false), 200);
  };

  const sparkles = useMemo(() =>
    Array.from({ length: 8 }, (_, i) => {
      const angle = (i / 8) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const dist = 26 + Math.random() * 14;
      return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, size: 3 + Math.random() * 2.5, delay: Math.random() * 0.1 };
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [rollKey, locked]);

  const faces = [
    { faceValue: 1, transform: `translateZ(${half}px)` },
    { faceValue: 6, transform: `rotateY(180deg) translateZ(${half}px)` },
    { faceValue: 2, transform: `rotateY(-90deg) translateZ(${half}px)` },
    { faceValue: 5, transform: `rotateY(90deg) translateZ(${half}px)` },
    { faceValue: 3, transform: `rotateX(-90deg) translateZ(${half}px)` },
    { faceValue: 4, transform: `rotateX(90deg) translateZ(${half}px)` },
  ];

  const bY = rollVar.bounceY;

  return (
    <div className="relative flex flex-col items-center overflow-visible" style={{ width: SIZE + 8, height: SIZE + 14 }}>
      {/* Sparkle particles on lock */}
      <AnimatePresence>
        {showSparkle && sparkles.map((s, i) => (
          <motion.div
            key={`sparkle-${i}`}
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
              left: '50%', top: SIZE / 2,
              marginLeft: -(SIZE + 10) / 2, marginTop: -(SIZE + 10) / 2, zIndex: 49,
            }}
            initial={{ scale: 0.8, opacity: 0.8 }}
            animate={{ scale: 1.3, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>

      {/* Outer wrapper with shadow and locked state */}
      <motion.div
        style={{
          width: SIZE, height: SIZE, borderRadius: RADIUS,
          boxShadow: locked
            ? '0 0 0 2.5px hsl(36 72% 50%), 0 0 16px rgba(245,185,66,0.3), 0 4px 10px rgba(0,0,0,0.15)'
            : '0 4px 10px rgba(0,0,0,0.15)',
          transition: 'box-shadow 0.3s ease, opacity 0.3s ease',
          opacity: canLock && !locked ? 0.5 : 1,
        }}
        animate={{
          scale: locked ? 1.1 : justToggled ? [1, 0.93, 1.05, 1] : 1,
        }}
        transition={justToggled ? { duration: 0.15, ease: 'easeOut' } : { duration: 0.25, ease: 'easeOut' }}
      >
        <div style={{ perspective: 240, width: SIZE, height: SIZE }}>
          <motion.button
            key={rollKey}
            onClick={handleToggle}
            className={cn('relative', canLock ? 'cursor-pointer' : 'cursor-default')}
            style={{ width: SIZE, height: SIZE, transformStyle: 'preserve-3d' }}
            animate={{
              rotateX: spinRotation.rotateX,
              rotateY: spinRotation.rotateY,
              y: isAnimating ? [0, bY, 2, -1, 0] : 0,
            }}
            transition={
              isAnimating
                ? {
                    rotateX: { duration: animDur, ease: [0.15, 0.85, 0.25, 1] },
                    rotateY: { duration: animDur, ease: [0.15, 0.85, 0.25, 1] },
                    y: { duration: animDur, times: [0, 0.55, 0.75, 0.9, 1], ease: 'easeOut' },
                  }
                : { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }
            }
            whileTap={canLock ? { scale: 0.93 } : {}}
          >
            {faces.map((face) => (
              <div key={face.faceValue} className="absolute inset-0" style={{ transform: face.transform, transformStyle: 'preserve-3d' }}>
                <DiceFace faceValue={face.faceValue} />
              </div>
            ))}
          </motion.button>
        </div>
      </motion.div>

      {/* Ground shadow */}
      <motion.div
        style={{
          width: SIZE * 0.55, height: 5, marginTop: 4, borderRadius: '50%',
          background: locked
            ? 'radial-gradient(ellipse, rgba(245,185,66,0.3), transparent)'
            : 'radial-gradient(ellipse, rgba(0,0,0,0.25), transparent)',
        }}
        animate={{
          scaleX: isAnimating ? [1, 0.6, 1.15, 0.95, 1] : locked ? 1.1 : 1,
          opacity: isAnimating ? [0.5, 0.15, 0.55, 0.45, 0.5] : 0.5,
        }}
        transition={
          isAnimating
            ? { duration: animDur, times: [0, 0.55, 0.75, 0.9, 1], ease: 'easeOut' }
            : { duration: 0.3, ease: 'easeOut' }
        }
      />
    </div>
  );
}
