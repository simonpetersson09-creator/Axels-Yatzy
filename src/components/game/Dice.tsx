import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

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

function DiceFace({ faceValue, size, locked }: { faceValue: number; size: number; locked: boolean }) {
  const positions = pipGridPositions[faceValue] || [];
  const pipSize = Math.round(size * 0.15);
  const padding = Math.round(size * 0.18);
  const radius = size * 0.22;

  return (
    <div
      className="absolute"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: '#ffffff',
        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.04)',
        backfaceVisibility: 'hidden',
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gridTemplateRows: 'repeat(3, 1fr)',
        padding,
        border: locked 
          ? '2px solid rgba(255,255,255,0.85)' 
          : '2px solid rgba(255,255,255,0.9)',
      }}
    >
      {Array.from({ length: 9 }, (_, i) => {
        const cellIndex = i + 1;
        const hasPip = positions.includes(cellIndex);
        return (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {hasPip && (
              <div
                style={{
                  width: pipSize,
                  height: pipSize,
                  borderRadius: '50%',
                  background: `radial-gradient(circle at 40% 35%, 
                      hsl(0 0% 25%) 0%, 
                      hsl(0 0% 10%) 70%, 
                      hsl(0 0% 5%) 100%)`,
                  boxShadow: `inset 0 1.5px 2px rgba(0,0,0,0.4), 
                    0 0.5px 1px rgba(255,255,255,0.12)`,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

const RESTING_TILTS = [
  { x: 0, y: 0, z: 0 },
  { x: 0, y: 0, z: 0 },
  { x: 0, y: 0, z: 0 },
  { x: 0, y: 0, z: 0 },
  { x: 0, y: 0, z: 0 },
];

export function Dice({ value, locked, rolling, onToggleLock, canLock }: DiceProps) {
  const size = 62;
  const half = size / 2;
  const radius = size * 0.22;
  const [isAnimating, setIsAnimating] = useState(false);
  const [spinRotation, setSpinRotation] = useState({ rotateX: 0, rotateY: 0 });
  const [justToggled, setJustToggled] = useState(false);
  const [rollKey, setRollKey] = useState(0);

  const tiltIndex = useMemo(() => Math.floor(Math.random() * RESTING_TILTS.length), []);
  const restingTilt = RESTING_TILTS[tiltIndex];

  const targetRotation = useMemo(() => {
    const base = valueToRotation[value];
    const extraX = (Math.floor(Math.random() * 4) + 3) * 180;
    const extraY = (Math.floor(Math.random() * 4) + 3) * 180;
    return { rotateX: base.rotateX + extraX, rotateY: base.rotateY + extraY };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, rolling]);

  useEffect(() => {
    if (rolling && !locked) {
      setRollKey(k => k + 1);
      setIsAnimating(true);
      setSpinRotation(targetRotation);
      const timer = setTimeout(() => {
        setIsAnimating(false);
        setSpinRotation(valueToRotation[value]);
      }, 3800);
      return () => clearTimeout(timer);
    } else if (!rolling) {
      setSpinRotation(valueToRotation[value]);
    }
  }, [rolling, value, locked, targetRotation]);

  // Track when dice becomes locked (not just toggled)
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

  // Generate sparkle positions
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

  const finalRotateX = spinRotation.rotateX + (isAnimating ? 0 : restingTilt.x);
  const finalRotateY = spinRotation.rotateY + (isAnimating ? 0 : restingTilt.y);

  return (
    <div className="relative flex flex-col items-center overflow-visible" style={{ width: size + 8, height: size + 16 }}>
      {/* Sparkle particles on lock */}
      <AnimatePresence>
        {showSparkle && sparkles.map((s, i) => (
          <motion.div
            key={`sparkle-${i}`}
            className="absolute pointer-events-none"
            style={{
              width: s.size,
              height: s.size,
              borderRadius: '50%',
              background: 'radial-gradient(circle, hsl(42 90% 70%), hsl(36 82% 52%))',
              boxShadow: '0 0 6px hsl(42 90% 60%), 0 0 12px hsl(36 82% 52% / 0.4)',
              left: '50%',
              top: '50%',
              marginLeft: -s.size / 2,
              marginTop: -s.size / 2,
              zIndex: 50,
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
              width: size + 12,
              height: size + 12,
              borderRadius: radius + 6,
              border: '2px solid hsl(36 82% 52%)',
              left: '50%',
              top: size / 2,
              marginLeft: -(size + 12) / 2,
              marginTop: -(size + 12) / 2,
              zIndex: 49,
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
          width: size,
          height: size,
          borderRadius: radius,
          boxShadow: locked
            ? `0 0 0 2.5px hsl(36 72% 50%), 
               0 0 20px rgba(245,185,66,0.4), 
               0 0 40px rgba(245,185,66,0.1), 
               0 6px 20px rgba(0,0,0,0.15)`
            : `0 3px 8px rgba(0,0,0,0.1), 
               0 1px 2px rgba(0,0,0,0.06), 
               0 8px 24px rgba(0,0,0,0.08)`,
          transition: 'box-shadow 0.3s ease',
        }}
        animate={{
          scale: locked ? 1.1 : justToggled ? [1, 0.93, 1.06, 1] : 1,
        }}
        transition={
          justToggled
            ? { duration: 0.15, ease: 'easeOut' }
            : { duration: 0.25, ease: 'easeOut' }
        }
      >
        <div style={{ perspective: 220, width: size, height: size }}>
          <motion.button
            key={rollKey}
            onClick={handleToggle}
            className={cn(
              'relative',
              canLock ? 'cursor-pointer' : 'cursor-default'
            )}
            style={{
              width: size,
              height: size,
              transformStyle: 'preserve-3d',
            }}
            animate={{
              rotateX: finalRotateX,
              rotateY: finalRotateY,
              rotateZ: isAnimating ? 0 : restingTilt.z,
              x: isAnimating ? [500, -10, 14, -4, 5, 0] : 0,
              y: isAnimating ? [0, -16, 0, -6, 0] : 0,
            }}
            transition={
              isAnimating
                ? {
                    duration: 3.8,
                    ease: [0.1, 0.8, 0.25, 1],
                    x: { 
                      duration: 3.2, 
                      times: [0, 0.35, 0.55, 0.72, 0.86, 1], 
                      ease: [0.08, 0.72, 0.22, 1],
                    },
                    y: { 
                      duration: 3.0, 
                      times: [0, 0.4, 0.6, 0.82, 1], 
                      ease: 'easeOut',
                    },
                  }
                : { duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }
            }
            whileTap={canLock ? { scale: 0.93 } : {}}
          >
            {faces.map((face) => (
              <div key={face.faceValue} className="absolute inset-0" style={{ transform: face.transform, transformStyle: 'preserve-3d' }}>
                <DiceFace faceValue={face.faceValue} size={size} locked={locked} />
              </div>
            ))}
          </motion.button>
        </div>
      </motion.div>

      {/* Ground shadow */}
      <motion.div
        style={{
          width: size * 0.55,
          height: 5,
          marginTop: 5,
          borderRadius: '50%',
          background: locked
            ? 'radial-gradient(ellipse, rgba(245, 185, 66, 0.35), transparent)'
            : 'radial-gradient(ellipse, rgba(0,0,0,0.25), transparent)',
        }}
        animate={{
          filter: isAnimating ? 'blur(8px)' : 'blur(3px)',
          opacity: isAnimating ? 0.1 : 0.55,
          scaleX: isAnimating ? 1.8 : 1,
        }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      />
    </div>
  );
}
