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
    <div className="mt-2 sm:mt-4 flex flex-col items-center justify-end pb-2 overflow-visible">
      <div className="flex flex-col origin-top scale-[0.78] sm:scale-100" style={{ gap: 26 }}>
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
              rolling={isRolling}
              onToggleLock={() => onToggleLock(index)}
              canLock={hasRolled && rollsLeft > 0}
            />
          </motion.div>
        ))}
      </div>

      {hasRolled && rollsLeft > 0 && (
        <motion.p
          className="text-center text-[9px] text-muted-foreground/40 mt-3 tracking-widest uppercase"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2, ease: 'easeOut' }}
        >
          Tryck för att låsa
        </motion.p>
      )}
    </div>
  );
}
