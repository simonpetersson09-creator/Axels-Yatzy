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
  const pipSize = Math.round(size * 0.15);
  const padding = Math.round(size * 0.17);

  return (
    <div
      className="absolute"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.22,
        background: locked
          ? 'linear-gradient(145deg, #fffef8 0%, #fff5d4 50%, #ffe8a8 100%)'
          : 'linear-gradient(145deg, #fafafa 0%, #f0efec 40%, #e8e6e2 100%)',
        boxShadow: locked
          ? 'inset 0 2px 8px rgba(255,255,255,0.95), inset 0 -3px 6px rgba(200,160,50,0.12), inset 2px 0 4px rgba(255,255,255,0.5)'
          : 'inset 0 2px 8px rgba(255,255,255,0.95), inset 0 -3px 6px rgba(0,0,0,0.08), inset 2px 0 4px rgba(255,255,255,0.5)',
        backfaceVisibility: 'hidden',
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gridTemplateRows: 'repeat(3, 1fr)',
        padding,
        border: locked ? '1px solid rgba(245,185,66,0.3)' : '1px solid rgba(0,0,0,0.06)',
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
                    ? 'radial-gradient(circle at 35% 35%, hsl(35 40% 30%), hsl(30 30% 12%))'
                    : 'radial-gradient(circle at 35% 35%, hsl(220 8% 28%), hsl(220 12% 10%))',
                  boxShadow: 'inset 0 1.5px 3px rgba(0,0,0,0.5), 0 0.5px 1px rgba(255,255,255,0.2)',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Each dice gets a unique subtle resting tilt for a natural look
const RESTING_TILTS = [
  { x: 8, y: -6, z: 2 },
  { x: -5, y: 8, z: -3 },
  { x: 6, y: 5, z: 1 },
  { x: -7, y: -4, z: -2 },
  { x: 4, y: 7, z: 3 },
];

export function Dice({ value, locked, rolling, onToggleLock, canLock }: DiceProps) {
  const size = 62;
  const half = size / 2;
  const [isAnimating, setIsAnimating] = useState(false);
  const [spinRotation, setSpinRotation] = useState({ rotateX: 0, rotateY: 0 });
  const [justToggled, setJustToggled] = useState(false);

  // Stable tilt per dice instance
  const tiltIndex = useMemo(() => Math.floor(Math.random() * RESTING_TILTS.length), []);
  const restingTilt = RESTING_TILTS[tiltIndex];

  const targetRotation = useMemo(() => {
    const base = valueToRotation[value];
    const extraX = (Math.floor(Math.random() * 2) + 1) * 360;
    const extraY = (Math.floor(Math.random() * 2) + 1) * 360;
    return { rotateX: base.rotateX + extraX, rotateY: base.rotateY + extraY };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, rolling]);

  useEffect(() => {
    if (rolling && !locked) {
      setIsAnimating(true);
      setSpinRotation(targetRotation);
      const timer = setTimeout(() => {
        setIsAnimating(false);
        setSpinRotation(valueToRotation[value]);
      }, 1800);
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

  // Final resting rotation includes the subtle tilt
  const finalRotateX = spinRotation.rotateX + (isAnimating ? 0 : restingTilt.x);
  const finalRotateY = spinRotation.rotateY + (isAnimating ? 0 : restingTilt.y);

  return (
    <div className="flex flex-col items-center" style={{ width: size + 8, height: size + 14 }}>
      {/* Outer wrapper — glow & scale */}
      <motion.div
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.22,
          boxShadow: locked
            ? '0 0 0 2.5px hsl(36 82% 52%), 0 0 20px rgba(245,185,66,0.6), 0 0 40px rgba(245,185,66,0.2), 0 10px 25px rgba(0,0,0,0.25)'
            : '0 6px 16px rgba(0,0,0,0.18), 0 2px 4px rgba(0,0,0,0.1), 0 12px 28px rgba(0,0,0,0.08)',
          transition: 'box-shadow 0.2s ease',
        }}
        animate={{
          scale: locked ? 1.1 : justToggled ? [1, 0.93, 1.06, 1] : 1,
        }}
        transition={
          justToggled
            ? { duration: 0.15, ease: 'easeOut' }
            : { duration: 0.2, ease: 'easeOut' }
        }
      >
        <div style={{ perspective: 500, width: size, height: size }}>
          <motion.button
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
              y: isAnimating ? [0, -26, -10, -16, 0] : 0,
            }}
            transition={
              isAnimating
                ? {
                    duration: 1.8,
                    ease: [0.22, 1, 0.36, 1],
                    y: { duration: 1.8, times: [0, 0.25, 0.45, 0.65, 1], ease: 'easeOut' },
                  }
                : { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }
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
          width: size * 0.6,
          height: 6,
          marginTop: 4,
          borderRadius: '50%',
          background: locked
            ? 'radial-gradient(ellipse, rgba(245, 185, 66, 0.4), transparent)'
            : 'radial-gradient(ellipse, rgba(0,0,0,0.3), transparent)',
        }}
        animate={{
          filter: isAnimating ? 'blur(8px)' : 'blur(3px)',
          opacity: isAnimating ? 0.15 : 0.6,
          scaleX: isAnimating ? 1.6 : 1,
        }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      />
    </div>
  );
}
