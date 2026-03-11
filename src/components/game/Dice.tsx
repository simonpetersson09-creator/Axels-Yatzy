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

const dotPositions: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 28], [72, 28], [28, 50], [72, 50], [28, 72], [72, 72]],
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
  const dots = dotPositions[faceValue] || [];
  const dotSize = size * 0.16;

  return (
    <div
      className="absolute rounded-xl"
      style={{
        width: size,
        height: size,
        background: locked
          ? 'linear-gradient(145deg, hsl(40 90% 62%), hsl(40 80% 42%))'
          : 'linear-gradient(145deg, hsl(42 15% 96%), hsl(38 10% 83%))',
        boxShadow: 'inset 0 2px 3px rgba(255,255,255,0.5), inset 0 -2px 4px rgba(0,0,0,0.1)',
        backfaceVisibility: 'hidden',
      }}
    >
      {dots.map(([x, y], i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            width: dotSize,
            height: dotSize,
            left: `${x}%`,
            top: `${y}%`,
            transform: 'translate(-50%, -50%)',
            background: locked
              ? 'radial-gradient(circle at 35% 35%, hsl(228 20% 18%), hsl(228 25% 8%))'
              : 'radial-gradient(circle at 35% 35%, hsl(228 15% 25%), hsl(228 20% 10%))',
            boxShadow: locked
              ? 'inset 0 1px 2px rgba(255,255,255,0.15), 0 1px 2px rgba(0,0,0,0.3)'
              : 'inset 0 1px 2px rgba(255,255,255,0.1), 0 1px 2px rgba(0,0,0,0.25)',
          }}
        />
      ))}
    </div>
  );
}

export function Dice({ value, locked, rolling, onToggleLock, canLock }: DiceProps) {
  const size = 72;
  const half = size / 2;
  const [isAnimating, setIsAnimating] = useState(false);
  const [spinRotation, setSpinRotation] = useState({ rotateX: 0, rotateY: 0 });

  const targetRotation = useMemo(() => {
    const base = valueToRotation[value];
    const extraX = (Math.floor(Math.random() * 2) + 2) * 360;
    const extraY = (Math.floor(Math.random() * 2) + 2) * 360;
    return {
      rotateX: base.rotateX + extraX,
      rotateY: base.rotateY + extraY,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, rolling]);

  useEffect(() => {
    if (rolling && !locked) {
      setIsAnimating(true);
      setSpinRotation(targetRotation);
      const timer = setTimeout(() => {
        setIsAnimating(false);
        setSpinRotation(valueToRotation[value]);
      }, 700);
      return () => clearTimeout(timer);
    } else if (!rolling) {
      setSpinRotation(valueToRotation[value]);
    }
  }, [rolling, value, locked, targetRotation]);

  const faces = [
    { faceValue: 1, transform: `translateZ(${half}px)` },
    { faceValue: 6, transform: `rotateY(180deg) translateZ(${half}px)` },
    { faceValue: 2, transform: `rotateY(-90deg) translateZ(${half}px)` },
    { faceValue: 5, transform: `rotateY(90deg) translateZ(${half}px)` },
    { faceValue: 3, transform: `rotateX(-90deg) translateZ(${half}px)` },
    { faceValue: 4, transform: `rotateX(90deg) translateZ(${half}px)` },
  ];

  return (
    <div
      className="relative"
      style={{ width: size + 8, height: size + 16 }}
    >
      {/* Glow ring for locked state */}
      {locked && (
        <motion.div
          className="absolute rounded-2xl z-0"
          style={{
            inset: -4,
            background: 'transparent',
            border: '2.5px solid hsl(40 90% 55%)',
            boxShadow: '0 0 16px hsl(40 90% 55% / 0.4), inset 0 0 12px hsl(40 90% 55% / 0.1)',
          }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        />
      )}

      <div style={{ perspective: 800, width: size, height: size, margin: '0 auto' }}>
        <motion.button
          onClick={canLock ? onToggleLock : undefined}
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
            rotateX: spinRotation.rotateX,
            rotateY: spinRotation.rotateY,
            y: isAnimating ? [0, -24, 0] : 0,
          }}
          transition={
            isAnimating
              ? { duration: 0.65, ease: [0.22, 1, 0.36, 1], y: { duration: 0.65, ease: 'easeOut' } }
              : { duration: 0.01 }
          }
          whileTap={canLock ? { scale: 0.9 } : {}}
        >
          {faces.map((face) => (
            <div key={face.faceValue} className="absolute inset-0" style={{ transform: face.transform, transformStyle: 'preserve-3d' }}>
              <DiceFace faceValue={face.faceValue} size={size} locked={locked} />
            </div>
          ))}
        </motion.button>
      </div>

      {/* Shadow */}
      <div
        className="mx-auto rounded-full transition-all duration-300"
        style={{
          width: size * 0.6,
          height: 6,
          marginTop: 2,
          background: locked
            ? 'radial-gradient(ellipse, hsl(40 90% 55% / 0.35), transparent)'
            : 'radial-gradient(ellipse, rgba(0,0,0,0.3), transparent)',
          filter: isAnimating ? 'blur(6px)' : 'blur(3px)',
          opacity: isAnimating ? 0.4 : 0.8,
        }}
      />
    </div>
  );
}
