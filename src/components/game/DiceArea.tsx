import { Dice } from './Dice';
import { motion } from 'framer-motion';

interface DiceAreaProps {
  dice: number[];
  lockedDice: boolean[];
  rollsLeft: number;
  isRolling: boolean;
  onRoll: () => void;
  onToggleLock: (index: number) => void;
  currentPlayerName: string;
}

export function DiceArea({ dice, lockedDice, rollsLeft, isRolling, onRoll, onToggleLock, currentPlayerName }: DiceAreaProps) {
  const canRoll = rollsLeft > 0;
  const hasRolled = rollsLeft < 3;

  return (
    <div className="space-y-4">
      {/* Current player */}
      <div className="text-center">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">Tur</p>
        <p className="text-lg font-display font-bold text-game-gold">{currentPlayerName}</p>
      </div>

      {/* Dice */}
      <div className="flex justify-center gap-4 py-2">
        {dice.map((value, index) => (
          <Dice
            key={index}
            value={value}
            locked={lockedDice[index]}
            rolling={isRolling}
            onToggleLock={() => onToggleLock(index)}
            canLock={hasRolled && rollsLeft > 0}
          />
        ))}
      </div>

      {/* Roll info */}
      <div className="flex justify-center gap-1">
        {[1, 2, 3].map(i => (
          <div
            key={i}
            className={`w-2 h-2 rounded-full transition-all ${
              i <= (3 - rollsLeft) ? 'bg-game-gold' : 'bg-muted'
            }`}
          />
        ))}
      </div>

      {/* Roll button */}
      <div className="flex justify-center">
        <motion.button
          onClick={onRoll}
          disabled={!canRoll || isRolling}
          className={`px-8 py-3.5 rounded-2xl font-display font-bold text-lg transition-all ${
            canRoll && !isRolling
              ? 'bg-primary text-primary-foreground game-shadow active:scale-95'
              : 'bg-muted text-muted-foreground'
          }`}
          whileTap={canRoll ? { scale: 0.95 } : {}}
        >
          {rollsLeft === 3 ? 'Kasta tärningarna' : rollsLeft === 0 ? 'Välj kategori' : `Kasta igen (${rollsLeft})`}
        </motion.button>
      </div>

      {hasRolled && rollsLeft > 0 && (
        <p className="text-center text-xs text-muted-foreground">
          Tryck på tärningar för att låsa dem
        </p>
      )}
    </div>
  );
}
