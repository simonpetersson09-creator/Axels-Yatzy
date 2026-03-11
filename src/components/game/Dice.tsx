import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  2: [[27, 27], [73, 73]],
  3: [[27, 27], [50, 50], [73, 73]],
  4: [[27, 27], [73, 27], [27, 73], [73, 73]],
  5: [[27, 27], [73, 27], [50, 50], [27, 73], [73, 73]],
  6: [[27, 27], [73, 27], [27, 50], [73, 50], [27, 73], [73, 73]],
};

function DiceDot({ x, y, locked, delay }: { x: number; y: number; locked: boolean; delay: number }) {
  return (
    <motion.div
      className={cn(
        'absolute rounded-full',
        locked ? 'bg-primary-foreground' : 'bg-game-dice-dot'
      )}
      style={{
        width: '18%',
        height: '18%',
        left: `${x}%`,
        top: `${y}%`,
        transform: 'translate(-50%, -50%)',
        boxShadow: locked
          ? 'inset 0 1px 2px rgba(255,255,255,0.3), 0 1px 2px rgba(0,0,0,0.2)'
          : 'inset 0 -1px 2px rgba(0,0,0,0.3), 0 1px 1px rgba(255,255,255,0.1)',
      }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: delay * 0.03 + 0.05, duration: 0.2, type: 'spring', stiffness: 500 }}
    />
  );
}

export function Dice({ value, locked, rolling, onToggleLock, canLock }: DiceProps) {
  const dots = dotPositions[value] || [];
  const [displayValue, setDisplayValue] = useState(value);
  const [isAnimating, setIsAnimating] = useState(false);

  // When rolling starts, cycle through random values before settling
  useEffect(() => {
    if (rolling && !locked) {
      setIsAnimating(true);
      let count = 0;
      const maxCycles = 8;
      const interval = setInterval(() => {
        setDisplayValue(Math.floor(Math.random() * 6) + 1);
        count++;
        if (count >= maxCycles) {
          clearInterval(interval);
          setDisplayValue(value);
          setIsAnimating(false);
        }
      }, 60);
      return () => clearInterval(interval);
    } else {
      setDisplayValue(value);
    }
  }, [rolling, value, locked]);

  const currentDots = dotPositions[displayValue] || [];

  return (
    <div style={{ perspective: '600px' }}>
      <motion.button
        onClick={canLock ? onToggleLock : undefined}
        className={cn(
          'relative rounded-2xl transition-colors duration-300',
          canLock && 'cursor-pointer',
          !canLock && 'cursor-default'
        )}
        style={{
          width: 64,
          height: 64,
          transformStyle: 'preserve-3d',
          background: locked
            ? 'linear-gradient(145deg, hsl(40 90% 60%), hsl(40 85% 45%))'
            : 'linear-gradient(145deg, hsl(40 12% 95%), hsl(40 8% 82%))',
          boxShadow: locked
            ? '0 0 20px hsl(40 90% 55% / 0.5), 0 8px 24px -4px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.4), inset 0 -2px 4px rgba(0,0,0,0.1)'
            : '0 8px 24px -4px rgba(0,0,0,0.5), 0 2px 8px -2px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.6), inset 0 -2px 4px rgba(0,0,0,0.08)',
          border: locked
            ? '1.5px solid hsl(40 80% 65% / 0.6)'
            : '1px solid rgba(255,255,255,0.15)',
        }}
        animate={
          isAnimating
            ? {
                rotateX: [0, 120, 240, 360],
                rotateY: [0, -90, 180, 0],
                rotateZ: [0, 45, -30, 0],
                scale: [1, 0.85, 0.9, 1],
                y: [0, -16, -8, 0],
              }
            : {
                rotateX: 0,
                rotateY: 0,
                rotateZ: 0,
                scale: 1,
                y: 0,
              }
        }
        transition={
          isAnimating
            ? { duration: 0.55, ease: [0.22, 1, 0.36, 1] }
            : { duration: 0.3, type: 'spring', stiffness: 300, damping: 20 }
        }
        whileTap={canLock ? { scale: 0.9 } : {}}
        whileHover={canLock ? { y: -2, boxShadow: '0 12px 32px -4px rgba(0,0,0,0.6)' } : {}}
      >
        {/* Dice face shine effect */}
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.25) 0%, transparent 50%, rgba(0,0,0,0.05) 100%)',
          }}
        />

        {/* Dots */}
        <AnimatePresence mode="wait">
          <motion.div
            key={displayValue}
            className="absolute inset-0"
            initial={false}
          >
            {currentDots.map(([x, y], i) => (
              <DiceDot
                key={`${displayValue}-${i}`}
                x={x}
                y={y}
                locked={locked}
                delay={i}
              />
            ))}
          </motion.div>
        </AnimatePresence>

        {/* Lock indicator */}
        {locked && (
          <motion.div
            className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center"
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
      </motion.button>
    </div>
  );
}
