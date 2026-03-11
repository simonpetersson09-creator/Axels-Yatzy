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

// Map value to rotation that shows that face
// Front=1, Right=2, Top=3, Bottom=4, Left=5, Back=6
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
  const dotSize = size * 0.17;

  return (
    <div
      className="absolute rounded-xl"
      style={{
        width: size,
        height: size,
        background: locked
          ? 'linear-gradient(145deg, hsl(40 90% 62%), hsl(40 80% 42%))'
          : 'linear-gradient(145deg, hsl(42 15% 96%), hsl(38 10% 83%))',
        boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.5), inset 0 -1px 3px rgba(0,0,0,0.08)',
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
  const size = 64;
  const half = size / 2;
  const [isAnimating, setIsAnimating] = useState(false);
  const [spinRotation, setSpinRotation] = useState({ rotateX: 0, rotateY: 0 });

  // Random extra full spins + land on correct face
  const targetRotation = useMemo(() => {
    const base = valueToRotation[value];
    // Add multiple full rotations for drama
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
        // Reset to base rotation without the extra spins
        setSpinRotation(valueToRotation[value]);
      }, 700);
      return () => clearTimeout(timer);
    } else if (!rolling) {
      setSpinRotation(valueToRotation[value]);
    }
  }, [rolling, value, locked, targetRotation]);

  // Face transforms: position each face of the cube
  const faces = [
    { faceValue: 1, transform: `translateZ(${half}px)` },                          // front
    { faceValue: 6, transform: `rotateY(180deg) translateZ(${half}px)` },           // back
    { faceValue: 2, transform: `rotateY(-90deg) translateZ(${half}px)` },           // right
    { faceValue: 5, transform: `rotateY(90deg) translateZ(${half}px)` },            // left
    { faceValue: 3, transform: `rotateX(-90deg) translateZ(${half}px)` },           // top
    { faceValue: 4, transform: `rotateX(90deg) translateZ(${half}px)` },            // bottom
  ];

  return (
    <div style={{ perspective: 800, width: size, height: size }}>
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
          y: isAnimating ? [0, -20, 0] : 0,
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

      {/* Shadow under the die */}
      <div
        className="mx-auto -mt-1 rounded-full transition-all duration-300"
        style={{
          width: size * 0.7,
          height: 6,
          background: locked
            ? 'radial-gradient(ellipse, hsl(40 90% 55% / 0.35), transparent)'
            : 'radial-gradient(ellipse, rgba(0,0,0,0.3), transparent)',
          filter: isAnimating ? 'blur(6px)' : 'blur(3px)',
          opacity: isAnimating ? 0.4 : 0.8,
        }}
      />

      {/* Lock indicator */}
      {locked && (
        <motion.div
          className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center z-10"
          style={{
            background: 'linear-gradient(135deg, hsl(40 90% 60%), hsl(40 85% 45%))',
            boxShadow: '0 2px 8px hsl(40 90% 55% / 0.5)',
          }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 15 }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-primary-foreground">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </motion.div>
      )}
    </div>
  );
}
