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

function DiceFace({ faceValue, size }: { faceValue: number; size: number }) {
  const positions = pipGridPositions[faceValue] || [];
  const pipSize = Math.round(size * 0.14);
  const padding = Math.round(size * 0.17);
  const radius = size * 0.20;

  return (
    <div
      className="absolute"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        // Layered background: subtle gradient for 3D lighting from upper-left
        background: `
          linear-gradient(135deg, 
            rgba(255,255,255,1) 0%, 
            rgba(248,248,250,1) 40%, 
            rgba(240,240,244,1) 100%
          )
        `,
        // Inner shadow for depth + outer subtle highlight
        boxShadow: `
          inset -2px -3px 6px rgba(0,0,0,0.06),
          inset 2px 2px 4px rgba(255,255,255,0.9),
          inset 0 -1px 3px rgba(0,0,0,0.04)
        `,
        backfaceVisibility: 'hidden',
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gridTemplateRows: 'repeat(3, 1fr)',
        padding,
        border: '1.5px solid rgba(230,230,235,0.8)',
      }}
    >
      {Array.from({ length: 9 }, (_, i) => {
        const cellIndex = i + 1;
        const hasPip = positions.includes(cellIndex);
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {hasPip && (
              <div
                style={{
                  width: pipSize,
                  height: pipSize,
                  borderRadius: '50%',
                  background: `radial-gradient(circle at 38% 32%, 
                      hsl(0 0% 30%) 0%, 
                      hsl(0 0% 12%) 60%, 
                      hsl(0 0% 6%) 100%)`,
                  boxShadow: `
                    inset 0 1.5px 2.5px rgba(0,0,0,0.45), 
                    0 0.5px 1px rgba(255,255,255,0.15),
                    0 1px 2px rgba(0,0,0,0.12)
                  `,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

const ANIM_DURATION = 0.75;

export function Dice({ value, locked, rolling, onToggleLock, canLock }: DiceProps) {
  const size = 64;
  const half = size / 2;
  const radius = size * 0.20;
  const [isAnimating, setIsAnimating] = useState(false);
  const [spinRotation, setSpinRotation] = useState({ rotateX: 0, rotateY: 0 });
  const [justToggled, setJustToggled] = useState(false);
  const [rollKey, setRollKey] = useState(0);

  // Random variation per roll for organic feel
  const rollVariation = useMemo(() => ({
    extraSpinsX: Math.floor(Math.random() * 2) + 2,  // 2-3 full rotations
    extraSpinsY: Math.floor(Math.random() * 2) + 2,
    durationOffset: (Math.random() - 0.5) * 0.12,    // ±60ms variation
    bounceHeight: -6 - Math.random() * 6,             // -6 to -12px
    bounceSettle: 1 + Math.random() * 2,              // 1-3px settle
    shakeX: (Math.random() - 0.5) * 4,                // slight horizontal shake
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [rolling, value]);

  const targetRotation = useMemo(() => {
    const base = valueToRotation[value];
    const extraX = rollVariation.extraSpinsX * 360;
    const extraY = rollVariation.extraSpinsY * 360;
    return { rotateX: base.rotateX + extraX, rotateY: base.rotateY + extraY };
  }, [value, rollVariation]);

  const animDuration = ANIM_DURATION + rollVariation.durationOffset;

  useEffect(() => {
    if (rolling && !locked) {
      setRollKey(k => k + 1);
      setIsAnimating(true);
      setSpinRotation(targetRotation);
      const timer = setTimeout(() => {
        setIsAnimating(false);
        setSpinRotation(valueToRotation[value]);
        playLandSound();
      }, animDuration * 1000);
      return () => clearTimeout(timer);
    } else if (!rolling) {
      setSpinRotation(valueToRotation[value]);
    }
  }, [rolling, value, locked, targetRotation, animDuration]);

  // Sparkle on lock
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
      const dist = 28 + Math.random() * 16;
      return {
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        size: 3 + Math.random() * 3,
        delay: Math.random() * 0.1,
      };
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

  const bH = rollVariation.bounceHeight;
  const bS = rollVariation.bounceSettle;
  const shX = rollVariation.shakeX;

  return (
    <div className="relative flex flex-col items-center overflow-visible" style={{ width: size + 8, height: size + 16 }}>
      {/* Sparkle particles on lock */}
      <AnimatePresence>
        {showSparkle && sparkles.map((s, i) => (
          <motion.div
            key={`sparkle-${i}`}
            className="absolute pointer-events-none"
            style={{
              width: s.size, height: s.size, borderRadius: '50%',
              background: 'radial-gradient(circle, hsl(42 90% 70%), hsl(36 82% 52%))',
              boxShadow: '0 0 6px hsl(42 90% 60%), 0 0 12px hsl(36 82% 52% / 0.4)',
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
              width: size + 12, height: size + 12, borderRadius: radius + 6,
              border: '2px solid hsl(36 82% 52%)',
              left: '50%', top: size / 2,
              marginLeft: -(size + 12) / 2, marginTop: -(size + 12) / 2, zIndex: 49,
            }}
            initial={{ scale: 0.8, opacity: 0.8 }}
            animate={{ scale: 1.3, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>

      {/* Outer glow wrapper */}
      <motion.div
        style={{
          width: size, height: size, borderRadius: radius,
          boxShadow: locked
            ? `0 0 0 2.5px hsl(36 72% 50%), 
               0 0 18px rgba(245,185,66,0.35), 
               0 0 36px rgba(245,185,66,0.08), 
               0 4px 16px rgba(0,0,0,0.12),
               0 8px 24px rgba(0,0,0,0.08)`
            : `0 3px 8px rgba(0,0,0,0.10), 
               0 1px 3px rgba(0,0,0,0.08), 
               0 8px 20px rgba(0,0,0,0.08),
               0 1px 0 rgba(255,255,255,0.4)`,
          transition: 'box-shadow 0.3s ease, opacity 0.3s ease',
          opacity: canLock && !locked ? 0.45 : 1,
        }}
        animate={{
          scale: locked ? 1.12 : justToggled ? [1, 0.92, 1.06, 1] : 1,
          y: locked ? -2 : 0, // Locked dice float slightly
        }}
        transition={
          justToggled
            ? { duration: 0.15, ease: 'easeOut' }
            : { duration: 0.25, ease: 'easeOut' }
        }
      >
        <div style={{ perspective: 250, width: size, height: size }}>
          <motion.button
            key={rollKey}
            onClick={handleToggle}
            className={cn('relative', canLock ? 'cursor-pointer' : 'cursor-default')}
            style={{ width: size, height: size, transformStyle: 'preserve-3d' }}
            animate={{
              rotateX: spinRotation.rotateX,
              rotateY: spinRotation.rotateY,
              y: isAnimating ? [0, bH, bS, -1, 0] : 0,
              x: isAnimating ? [0, shX, -shX * 0.5, shX * 0.2, 0] : 0,
            }}
            transition={
              isAnimating
                ? {
                    rotateX: { duration: animDuration, ease: [0.15, 0.85, 0.25, 1] },
                    rotateY: { duration: animDuration, ease: [0.15, 0.85, 0.25, 1] },
                    y: {
                      duration: animDuration,
                      times: [0, 0.55, 0.72, 0.88, 1],
                      ease: 'easeOut',
                    },
                    x: {
                      duration: animDuration,
                      times: [0, 0.3, 0.6, 0.85, 1],
                      ease: 'easeOut',
                    },
                  }
                : { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }
            }
            whileTap={canLock ? { scale: 0.93 } : {}}
          >
            {faces.map((face) => (
              <div key={face.faceValue} className="absolute inset-0" style={{ transform: face.transform, transformStyle: 'preserve-3d' }}>
                <DiceFace faceValue={face.faceValue} size={size} />
              </div>
            ))}
          </motion.button>
        </div>
      </motion.div>

      {/* Ground shadow */}
      <motion.div
        style={{
          width: size * 0.55, height: 6, marginTop: 5, borderRadius: '50%',
          background: locked
            ? 'radial-gradient(ellipse, rgba(245, 185, 66, 0.3), transparent)'
            : 'radial-gradient(ellipse, rgba(0,0,0,0.25), transparent)',
        }}
        animate={{
          scaleX: isAnimating ? [1, 0.6, 1.2, 0.95, 1] : locked ? 1.15 : 1,
          scaleY: isAnimating ? [1, 0.5, 1.15, 0.95, 1] : 1,
          opacity: isAnimating ? [0.5, 0.15, 0.55, 0.45, 0.5] : locked ? 0.4 : 0.5,
          filter: isAnimating ? 'blur(5px)' : 'blur(3px)',
        }}
        transition={
          isAnimating
            ? {
                scaleX: { duration: animDuration, times: [0, 0.55, 0.72, 0.88, 1], ease: 'easeOut' },
                scaleY: { duration: animDuration, times: [0, 0.55, 0.72, 0.88, 1], ease: 'easeOut' },
                opacity: { duration: animDuration, times: [0, 0.55, 0.72, 0.88, 1], ease: 'easeOut' },
                filter: { duration: 0.3 },
              }
            : { duration: 0.3, ease: 'easeOut' }
        }
      />
    </div>
  );
}
