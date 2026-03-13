import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
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
  2: { rotateX: 0, rotateY: -90 },
  3: { rotateX: -90, rotateY: 0 },
  4: { rotateX: 90, rotateY: 0 },
  5: { rotateX: 0, rotateY: 90 },
  6: { rotateX: 0, rotateY: 180 },
};

function DiceFace({ faceValue, size, locked }: { faceValue: number; size: number; locked: boolean }) {
  const positions = pipGridPositions[faceValue] || [];
  const pipSize = Math.round(size * 0.14);
  const padding = Math.round(size * 0.19);
  const radius = size * 0.28;

  return (
    <div
      className="absolute"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: locked
          ? `linear-gradient(155deg, 
              hsl(45 80% 98%) 0%, 
              hsl(42 70% 90%) 35%, 
              hsl(38 65% 82%) 70%, 
              hsl(35 60% 76%) 100%)`
          : `linear-gradient(155deg, 
              hsl(40 15% 98%) 0%, 
              hsl(30 8% 93%) 30%, 
              hsl(25 6% 88%) 65%, 
              hsl(20 4% 84%) 100%)`,
        boxShadow: locked
          ? `inset 0 3px 10px rgba(255,255,255,0.9), 
             inset 0 -4px 8px rgba(180,130,30,0.1), 
             inset 3px 0 6px rgba(255,255,255,0.4),
             inset -2px 0 4px rgba(180,130,30,0.06)`
          : `inset 0 3px 10px rgba(255,255,255,0.9), 
             inset 0 -4px 8px rgba(0,0,0,0.06), 
             inset 3px 0 6px rgba(255,255,255,0.4),
             inset -2px 0 4px rgba(0,0,0,0.03)`,
        backfaceVisibility: 'hidden',
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gridTemplateRows: 'repeat(3, 1fr)',
        padding,
        border: locked 
          ? '1.5px solid rgba(220,170,50,0.25)' 
          : '1.5px solid rgba(0,0,0,0.04)',
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
                  background: locked
                    ? `radial-gradient(circle at 38% 32%, 
                        hsl(32 35% 32%) 0%, 
                        hsl(28 30% 18%) 60%, 
                        hsl(25 25% 12%) 100%)`
                    : `radial-gradient(circle at 38% 32%, 
                        hsl(215 8% 30%) 0%, 
                        hsl(215 10% 16%) 60%, 
                        hsl(215 12% 8%) 100%)`,
                  boxShadow: `
                    inset 0 2px 3px rgba(0,0,0,0.45), 
                    inset 0 -1px 2px rgba(255,255,255,0.08),
                    0 0.5px 1.5px rgba(255,255,255,0.15),
                    0 0 0 0.5px rgba(0,0,0,0.1)`,
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
  { x: 12, y: -9, z: 3 },
  { x: -10, y: 14, z: -4 },
  { x: 13, y: 8, z: 3.5 },
  { x: -14, y: -7, z: -3.5 },
  { x: 8, y: 13, z: 4 },
];

export function Dice({ value, locked, rolling, onToggleLock, canLock }: DiceProps) {
  const size = 64;
  const half = size / 2;
  const radius = size * 0.28;
  const [isAnimating, setIsAnimating] = useState(false);
  const [spinRotation, setSpinRotation] = useState({ rotateX: 0, rotateY: 0 });
  const [justToggled, setJustToggled] = useState(false);
  const [rollKey, setRollKey] = useState(0);

  const tiltIndex = useMemo(() => Math.floor(Math.random() * RESTING_TILTS.length), []);
  const restingTilt = RESTING_TILTS[tiltIndex];

  const targetRotation = useMemo(() => {
    const base = valueToRotation[value];
    const extraX = (Math.floor(Math.random() * 3) + 2) * 360;
    const extraY = (Math.floor(Math.random() * 3) + 2) * 360;
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
      }, 3000);
      return () => clearTimeout(timer);
    } else if (!rolling) {
      setSpinRotation(valueToRotation[value]);
    }
  }, [rolling, value, locked, targetRotation]);

  const handleToggle = () => {
    if (!canLock) return;
    setJustToggled(true);
    onToggleLock();
    setTimeout(() => setJustToggled(false), 200);
  };

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
    <div className="flex flex-col items-center overflow-visible" style={{ width: size + 8, height: size + 16 }}>
      {/* Outer glow wrapper */}
      <motion.div
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          boxShadow: locked
            ? `0 0 0 2px hsl(36 82% 52%), 
               0 0 16px rgba(245,185,66,0.5), 
               0 0 36px rgba(245,185,66,0.15), 
               0 8px 24px rgba(0,0,0,0.2)`
            : `0 4px 12px rgba(0,0,0,0.15), 
               0 1px 3px rgba(0,0,0,0.08), 
               0 10px 30px rgba(0,0,0,0.1)`,
          transition: 'box-shadow 0.25s ease',
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
        <div style={{ perspective: 320, width: size, height: size }}>
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
                    duration: 3.0,
                    ease: [0.12, 0.82, 0.3, 1],
                    x: { 
                      duration: 2.6, 
                      times: [0, 0.35, 0.55, 0.72, 0.86, 1], 
                      ease: [0.1, 0.75, 0.25, 1],
                    },
                    y: { 
                      duration: 2.4, 
                      times: [0, 0.4, 0.6, 0.82, 1], 
                      ease: 'easeOut',
                    },
                  }
                : { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }
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
