import { Dice, DiceGradientDefs } from './Dice';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface DiceAreaProps {
  dice: number[];
  lockedDice: boolean[];
  rollsLeft: number;
  isRolling: boolean;
  onToggleLock: (index: number) => void;
  compact?: boolean;
  className?: string;
}

export function DiceArea({ dice, lockedDice, rollsLeft, isRolling, onToggleLock, compact = false, className }: DiceAreaProps) {
  const hasRolled = rollsLeft < 3;
  const diceSize = compact ? 42 : 47;

  // No organic tilt — dice stay upright for a cleaner, more controlled look.
  const tilts = [0, 0, 0, 0, 0];
  const offsets = [-6, 5, -3, 7, -4];

  return (
    <div className={cn('mt-[42px] flex flex-col items-center justify-end pb-0 overflow-visible', className)}>
      <div className="flex flex-col items-center" style={{ gap: compact ? 20 : 26 }}>
        {dice.map((value, index) => {
          const offsetX = offsets[index % offsets.length];
          return (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: offsetX }}
              transition={{ delay: index * 0.07, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center justify-center"
              style={{ transformOrigin: 'center' }}
            >

              <Dice
                value={value}
                locked={lockedDice[index]}
                rolling={isRolling && !lockedDice[index]}
                onToggleLock={() => onToggleLock(index)}
                canLock={!isRolling && hasRolled && rollsLeft > 0}
                size={diceSize}
                hasRolled={hasRolled}
              />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
