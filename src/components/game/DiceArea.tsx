import { Dice } from './Dice';
import { motion } from 'framer-motion';

interface DiceAreaProps {
  dice: number[];
  lockedDice: boolean[];
  rollsLeft: number;
  isRolling: boolean;
  onToggleLock: (index: number) => void;
}

export function DiceArea({ dice, lockedDice, rollsLeft, isRolling, onToggleLock }: DiceAreaProps) {
  const hasRolled = rollsLeft < 3;

  return (
    <div className="flex flex-col items-center pt-[160px]">
      <div className="flex flex-col gap-3 sm:gap-4">
        {dice.map((value, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.04, duration: 0.3 }}
            className="flex items-center justify-center"
          >
            <Dice
              value={value}
              locked={lockedDice[index]}
              rolling={isRolling}
              onToggleLock={() => onToggleLock(index)}
              canLock={hasRolled && rollsLeft > 0}
            />
          </motion.div>
        ))}
      </div>

      {hasRolled && rollsLeft > 0 && (
        <motion.p
          className="text-center text-[9px] sm:text-[10px] text-muted-foreground/50 mt-3 sm:mt-4 tracking-wide hidden sm:block"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          Tryck för att låsa
        </motion.p>
      )}
    </div>
  );
}
