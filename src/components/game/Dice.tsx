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
  const dotSize = size * 0.15;

  return (
    <div
      className="absolute"
      style={{
        width: size,
        height: size,
        borderRadius: 14,
        background: 'linear-gradient(145deg, hsl(40 10% 94%), hsl(36 8% 82%))',
        boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.5), inset 0 -2px 4px rgba(0,0,0,0.08)',
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
            background: 'radial-gradient(circle at 35% 35%, hsl(225 12% 22%), hsl(225 18% 8%))',
            boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
          }}
        />
      ))}
    </div>
  );
}

export function Dice({ value, locked, rolling, onToggleLock, canLock }: DiceProps) {
  const size = 68;
  const half = size / 2;
  const [isAnimating, setIsAnimating] = useState(false);
  const [spinRotation, setSpinRotation] = useState({ rotateX: 0, rotateY: 0 });
  const [justToggled, setJustToggled] = useState(false);

  const targetRotation = useMemo(() => {
    const base = valueToRotation[value];
    const extraX = (Math.floor(Math.random() * 3) + 2) * 360;
    const extraY = (Math.floor(Math.random() * 3) + 2) * 360;
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
      }, 750);
      return () => clearTimeout(timer);
    } else if (!rolling) {
      setSpinRotation(valueToRotation[value]);
    }
  }, [rolling, value, locked, targetRotation]);

  const handleToggle = () => {
    if (!canLock) return;
    setJustToggled(true);
    onToggleLock();
    setTimeout(() => setJustToggled(false), 300);
  };

  const faces = [
    { faceValue: 1, transform: `translateZ(${half}px)` },
    { faceValue: 6, transform: `rotateY(180deg) translateZ(${half}px)` },
    { faceValue: 2, transform: `rotateY(-90deg) translateZ(${half}px)` },
    { faceValue: 5, transform: `rotateY(90deg) translateZ(${half}px)` },
    { faceValue: 3, transform: `rotateX(-90deg) translateZ(${half}px)` },
    { faceValue: 4, transform: `rotateX(90deg) translateZ(${half}px)` },
  ];

  return (
    <div className="relative" style={{ width: size + 6, height: size + 10 }}>
      {/* Locked glow ring and border */}
      {locked && (
        <motion.div
          className="absolute pointer-events-none z-0"
          style={{
            inset: -4,
            borderRadius: 14,
            border: '3px solid hsl(42 88% 52%)',
            boxShadow: '0 0 20px hsl(42 88% 52% / 0.5), 0 0 8px hsl(42 88% 52% / 0.3)',
          }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1.05 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        />
      )}

      <div style={{ perspective: 600, width: size, height: size, margin: '0 auto' }}>
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
            rotateX: spinRotation.rotateX,
            rotateY: spinRotation.rotateY,
            y: isAnimating ? [0, -22, -8, -14, 0] : justToggled ? [0, -6, 0] : 0,
            scale: locked ? 1.05 : justToggled ? [1, 0.9, 1.06, 1] : 1,
          }}
          transition={
            isAnimating
              ? {
                  duration: 0.75,
                  ease: [0.16, 1, 0.3, 1],
                  y: { duration: 0.75, times: [0, 0.3, 0.5, 0.7, 1], ease: 'easeOut' },
                }
              : justToggled
              ? { duration: 0.3, ease: 'easeOut' }
              : { type: 'spring', stiffness: 300, damping: 22 }
          }
          whileTap={canLock ? { scale: 0.88 } : {}}
        >
          {faces.map((face) => (
            <div key={face.faceValue} className="absolute inset-0" style={{ transform: face.transform, transformStyle: 'preserve-3d' }}>
              <DiceFace faceValue={face.faceValue} size={size} locked={locked} />
            </div>
          ))}
        </motion.button>
      </div>

      {/* Shadow */}
      <motion.div
        className="mx-auto rounded-full"
        style={{
          width: size * 0.55,
          height: 5,
          marginTop: 3,
          background: locked
            ? 'radial-gradient(ellipse, hsl(42 88% 52% / 0.4), transparent)'
            : 'radial-gradient(ellipse, rgba(0,0,0,0.25), transparent)',
        }}
        animate={{
          filter: isAnimating ? 'blur(6px)' : 'blur(2px)',
          opacity: isAnimating ? 0.2 : 0.7,
          scaleX: isAnimating ? 1.4 : 1,
        }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      />
    </div>
  );
}
