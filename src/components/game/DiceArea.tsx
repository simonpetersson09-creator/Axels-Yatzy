import { lazy, Suspense, useCallback } from 'react';
import { cn } from '@/lib/utils';

// WebGL is browser-only — load the engine lazily on the client.
const DiceSet = lazy(() => import('@/components/dice-engine/DiceSet'));

interface DiceAreaProps {
  dice: number[];
  lockedDice: boolean[];
  rollsLeft: number;
  isRolling: boolean;
  onToggleLock: (index: number) => void;
  compact?: boolean;
  className?: string;
}

type Five<T> = [T, T, T, T, T];

const toFive = <T,>(arr: T[], fallback: T): Five<T> =>
  [0, 1, 2, 3, 4].map((i) => (arr[i] === undefined ? fallback : arr[i])) as Five<T>;

/** Matches the previous CSS dice metrics so the layout is unchanged. */
export function DiceArea({
  dice,
  lockedDice,
  rollsLeft,
  isRolling,
  onToggleLock,
  compact = false,
  className,
}: DiceAreaProps) {
  const hasRolled = rollsLeft < 3;
  const diceSize = compact ? 62 : 68;
  const gap = compact ? 20 : 24;
  const canLock = !isRolling && hasRolled && rollsLeft > 0;

  const columnHeight = diceSize * 5 + gap * 4;
  const columnWidth = Math.round(diceSize * 1.85);

  const handleDieClick = useCallback(
    (index: number) => {
      if (!canLock) return;
      onToggleLock(index);
    },
    [canLock, onToggleLock],
  );

  return (
    <div className={cn('mt-[42px] flex flex-col items-center justify-end pb-0 overflow-visible', className)}>
      <div className="relative" style={{ height: columnHeight, width: columnWidth }}>
        <Suspense fallback={null}>
          <DiceSet
            values={toFive(dice, 1)}
            held={toFive(lockedDice, false)}
            rolling={isRolling}
            onDieClick={handleDieClick}
            onRollComplete={() => {
              /* The game state owns roll timing; nothing to do here. */
            }}
            spacing={0.16}
            fill={0.97}
            duration={1.3}
            className="absolute inset-0"
          />
        </Suspense>
      </div>
    </div>
  );
}
