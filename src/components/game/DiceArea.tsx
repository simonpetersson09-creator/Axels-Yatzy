import { Dice } from './Dice';
import { motion } from 'framer-motion';

interface DiceAreaProps {
  dice: number[];
  lockedDice: boolean[];
  rollsLeft: number;
  isRolling: boolean;
  onToggleLock: (index: number) => void;
  compact?: boolean;
}

export function DiceArea({ dice, lockedDice, rollsLeft, isRolling, onToggleLock, compact = false }: DiceAreaProps) {
  const hasRolled = rollsLeft < 3;
  const diceSize = compact ? 50 : 56;

  return (
    <div className="mt-[42px] flex flex-col items-center justify-end pb-0 overflow-visible">
      <div className="flex flex-col" style={{ gap: compact ? 20 : 26 }}>
        {dice.map((value, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.07, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center justify-center"
          >
            <Dice
              value={value}
              locked={lockedDice[index]}
              rolling={isRolling && !lockedDice[index]}
              onToggleLock={() => onToggleLock(index)}
              canLock={!isRolling && hasRolled && rollsLeft > 0}
              size={diceSize}
            />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
