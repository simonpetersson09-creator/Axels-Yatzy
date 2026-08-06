import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
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
  /** Index of the player whose turn it is — tints the pips in their colour. */
  playerIndex?: number;
}

/** Pip tints per player slot — rich, saturated jewel tones that stay legible
 *  against the ivory die face. */
const PIP_COLORS = [
  'hsl(38, 92%, 40%)',
  'hsl(214, 82%, 46%)',
  'hsl(158, 72%, 27%)',
  'hsl(352, 76%, 44%)',
];

/** The pip colour swaps while the dice are off-screen mid-sweep, so the change
 *  is never visible on the outgoing dice — only on the incoming ones. */
const PIP_SWAP_DELAY_MS = 450;


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
  playerIndex,
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
  const [resetKey, setResetKey] = useState(0);
  const hadRolledRef = useRef(false);
  useEffect(() => {
    if (rollsLeft < 3) {
      hadRolledRef.current = true;
    } else if (hadRolledRef.current) {
      hadRolledRef.current = false;
      setResetKey((k) => k + 1);
    }
  }, [rollsLeft]);

  // Deferred pip colour: hold the previous player's tint until the dice have
  // swept off-screen, then swap so the new colour arrives with the new dice.
  const [shownPlayerIndex, setShownPlayerIndex] = useState(playerIndex);
  useEffect(() => {
    if (playerIndex === shownPlayerIndex) return;
    if (shownPlayerIndex === undefined) {
      setShownPlayerIndex(playerIndex);
      return;
    }
    const t = window.setTimeout(() => setShownPlayerIndex(playerIndex), PIP_SWAP_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [playerIndex, shownPlayerIndex]);



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
              pipColor={typeof playerIndex === 'number' ? PIP_COLORS[playerIndex % PIP_COLORS.length] : undefined}
              onRollComplete={() => {
                /* The game state owns roll timing; nothing to do here. */
              }}
              spacing={spacing}
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
