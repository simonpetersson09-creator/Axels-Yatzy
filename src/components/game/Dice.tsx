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
      className="absolute"
      style={{
        width: size,
        height: size,
        borderRadius: 14,
        background: locked
          ? 'linear-gradient(180deg, #fffdf7 0%, #fff7e0 100%)'
          : 'linear-gradient(145deg, #ffffff, #f2f0ed)',
        boxShadow: 'inset 0 2px 6px rgba(255,255,255,0.9), inset 0 -2px 5px rgba(0,0,0,0.06)',
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
            background: 'radial-gradient(circle at 38% 38%, hsl(220 10% 25%), hsl(220 15% 10%))',
            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.4), 0 1px 1px rgba(255,255,255,0.15)',
          }}
        />
      ))}
    </div>
  );
}

export function Dice({ value, locked, rolling, onToggleLock, canLock }: DiceProps) {
  const size = 60;
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

  return (
    <div className="flex items-center justify-center" style={{ width: size, height: size }}>
      {/* Outer wrapper handles highlight — stays flat, no 3D */}
      <motion.div
        style={{
          width: size,
          height: size,
          borderRadius: 14,
          boxShadow: locked
            ? '0 0 0 3px #F5B942, 0 0 18px rgba(245,185,66,0.7), 0 8px 20px rgba(0,0,0,0.2)'
            : '0 4px 10px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)',
          transition: 'box-shadow 0.15s ease',
        }}
        animate={{
          scale: locked ? 1.08 : justToggled ? [1, 0.95, 1.06, 1] : 1,
        }}
        transition={
          justToggled
            ? { duration: 0.12, ease: 'easeOut' }
            : { duration: 0.15, ease: 'easeOut' }
        }
      >
        <div style={{ perspective: 600, width: size, height: size }}>
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
              y: isAnimating ? [0, -22, -8, -14, 0] : 0,
            }}
            transition={
              isAnimating
                ? {
                    duration: 0.7,
                    ease: [0.16, 1, 0.3, 1],
                    y: { duration: 0.7, times: [0, 0.3, 0.5, 0.7, 1], ease: 'easeOut' },
                  }
                : { duration: 0.15, ease: 'easeOut' }
            }
            whileTap={canLock ? { scale: 0.95 } : {}}
          >
            {faces.map((face) => (
              <div key={face.faceValue} className="absolute inset-0" style={{ transform: face.transform, transformStyle: 'preserve-3d' }}>
                <DiceFace faceValue={face.faceValue} size={size} locked={locked} />
              </div>
            ))}
          </motion.button>
        </div>
      </motion.div>

      {/* Shadow */}
      <motion.div
        className="mx-auto rounded-full"
        style={{
          width: size * 0.55,
          height: 5,
          marginTop: 3,
          background: locked
            ? 'radial-gradient(ellipse, rgba(245, 185, 66, 0.35), transparent)'
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
