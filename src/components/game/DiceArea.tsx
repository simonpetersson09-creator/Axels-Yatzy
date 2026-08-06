import { lazy, Suspense, useCallback, useRef } from 'react';
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
  /** Drives the hold-ring colour; pips stay black. */
  playerIndex?: number;
}

type Five<T> = [T, T, T, T, T];

// Same hues as the scoreboard player columns.
const HOLD_COLORS = [
  'hsl(36 82% 52%)',
  'hsl(210 70% 52%)',
  'hsl(155 60% 42%)',
  'hsl(350 65% 52%)',
];

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
  playerIndex = 0,
}: DiceAreaProps) {
  const hasRolled = rollsLeft < 3;
  const diceSize = compact ? 48 : 54;
  const gap = compact ? 26 : 32;
  const spacing = compact ? 0.60 : 0.72;
  const canLock = !isRolling && hasRolled && rollsLeft > 0;

  const columnHeight = diceSize * 5 + gap * 4;
  const columnWidth = Math.round(diceSize * 1.85);

  // The WebGL canvas is the only real clipping context, so it is drawn larger
  // than the resting column. `fill` is divided by the same factor, which keeps
  // the camera framing — and therefore the resting dice positions and size —
  // pixel-identical while giving the roll animation room to overshoot.
  const OVERSCAN = 1.5;
  const overscanWidth = Math.round(columnWidth * OVERSCAN);
  const overscanHeight = Math.round(columnHeight * OVERSCAN);
  const overscanX = Math.round((overscanWidth - columnWidth) / 2);
  const overscanY = Math.round((overscanHeight - columnHeight) / 2);

  // End-of-turn reset: when the roll counter goes back to 3 after a played
  // turn, the dice sweep off to the right and glide back in on a clean pose.
  // This is derived during render (not in an effect) so the bumped resetKey
  // reaches the dice in the *same* commit as the reset dice values — child
  // effects run before parent effects, so an effect here would arrive one
  // commit too late and the dice would visibly snap before sweeping out.
  const hadRolledRef = useRef(false);
  const resetKeyRef = useRef(0);
  if (rollsLeft < 3) {
    hadRolledRef.current = true;
  } else if (hadRolledRef.current) {
    hadRolledRef.current = false;
    resetKeyRef.current += 1;
  }
  const resetKey = resetKeyRef.current;


  const handleDieClick = useCallback(
    (index: number) => {
      if (!canLock) return;
      onToggleLock(index);
    },
    [canLock, onToggleLock],
  );

  return (
    <div
      className={cn(
        'relative mt-[42px] flex flex-col items-center justify-end pb-0 overflow-visible',
        className,
      )}
    >
      <div
        className="relative overflow-visible"
        style={{ height: columnHeight, width: columnWidth, zIndex: 30 }}
      >
        {/* Oversized, non-interactive overlay layer for the 3D canvas. */}
        <div
          className="pointer-events-none absolute overflow-visible"
          style={{
            top: -overscanY,
            left: -overscanX,
            width: overscanWidth,
            height: overscanHeight,
            zIndex: 30,
          }}
        >
          <Suspense fallback={null}>
            <DiceSet
              values={toFive(dice, 1)}
              held={toFive(lockedDice, false)}
              rolling={isRolling}
              resetKey={resetKey}
              onRollComplete={() => {
                /* The game state owns roll timing; nothing to do here. */
              }}
              spacing={spacing}
              holdColor={HOLD_COLORS[playerIndex % HOLD_COLORS.length]}
              fill={1 / OVERSCAN}
              duration={1.3}
              className="h-full w-full"
            />
          </Suspense>
        </div>

        {/* Tap targets sit on the resting dice only, so the rest of the UI
            (scorecard, buttons) keeps receiving taps normally. */}
        <div className="absolute inset-0" style={{ zIndex: 31 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <button
              key={i}
              type="button"
              aria-label={`Die ${i + 1}`}
              onClick={() => handleDieClick(i)}
              disabled={!canLock}
              className="absolute bg-transparent disabled:pointer-events-none"
              style={{
                top: i * (diceSize + gap),
                left: Math.round((columnWidth - diceSize) / 2),
                width: diceSize,
                height: diceSize,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );

}
