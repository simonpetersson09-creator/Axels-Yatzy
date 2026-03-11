import { Dice } from './Dice';

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
    <div className="flex flex-col items-center justify-center self-stretch py-4">
      <div className="flex flex-col gap-3">
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

      {hasRolled && rollsLeft > 0 && (
        <p className="text-center text-[11px] text-muted-foreground mt-3 max-w-[80px] leading-tight">
          Tryck för att låsa
        </p>
      )}
    </div>
  );
}
