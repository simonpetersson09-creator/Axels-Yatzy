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
  2: [[25, 25], [75, 75]],
  3: [[25, 25], [50, 50], [75, 75]],
  4: [[25, 25], [75, 25], [25, 75], [75, 75]],
  5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
  6: [[25, 25], [75, 25], [25, 50], [75, 50], [25, 75], [75, 75]],
};

export function Dice({ value, locked, rolling, onToggleLock, canLock }: DiceProps) {
  const dots = dotPositions[value] || [];

  return (
    <motion.button
      onClick={canLock ? onToggleLock : undefined}
      className={cn(
        'relative w-[56px] h-[56px] rounded-xl transition-all duration-200',
        locked
          ? 'bg-game-dice-locked shadow-[0_0_16px_hsl(var(--game-gold)/0.4)] ring-2 ring-game-gold/60'
          : 'bg-game-dice shadow-[0_4px_12px_rgba(0,0,0,0.3)]',
        canLock && 'cursor-pointer active:scale-95',
        !canLock && 'cursor-default'
      )}
      animate={rolling && !locked ? {
        rotateX: [0, 180, 360],
        rotateY: [0, 90, 180],
        scale: [1, 0.8, 1],
      } : {}}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      {dots.map(([x, y], i) => (
        <div
          key={i}
          className={cn(
            'absolute w-[10px] h-[10px] rounded-full',
            locked ? 'bg-primary-foreground' : 'bg-game-dice-dot'
          )}
          style={{
            left: `${x}%`,
            top: `${y}%`,
            transform: 'translate(-50%, -50%)',
          }}
        />
      ))}
      {locked && (
        <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-game-gold rounded-full flex items-center justify-center">
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-primary-foreground">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
      )}
    </motion.button>
  );
}
