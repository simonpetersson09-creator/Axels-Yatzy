import type { DiceLook } from '@/lib/dice-skin';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { DiceSet } from '@/components/dice-engine';

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
  /** Dice colour for the player whose turn it is. */
  skin?: DiceLook;
}

type Five<T> = [T, T, T, T, T];

// Same hues as the scoreboard player columns.
// three.js Color.set() does not parse space-separated hsl(), so use hex.
const HOLD_COLORS = ['#e99920', '#2f85da', '#2bab76', '#d43550'];

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
  skin = 'white',
}: DiceAreaProps) {
  const hasRolled = rollsLeft < 3;
  // --dice-scale (index.css) shrinks the column when the ad banner needs room.
  // Real sizes, not a CSS transform: the 3D canvas measures its scaled box and
  // would shrink twice, and the entry edge would move inside the screen.
  const [diceScale, gapScale] = useDiceScale();
  const diceSize = Math.round((compact ? 54 : 60) * diceScale);
  const gap = Math.round((compact ? 29 : 36) * gapScale);
  // Keep the 3D gaps in step with the DOM gaps. Otherwise tighter CSS gaps
  // only shrink the canvas while the camera still reserves the old spacing.
  const spacing = (compact ? 0.65 : 0.78) * gapScale / diceScale;
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
        'ios-dice-zone relative mt-[var(--dice-top-gap,42px)] flex flex-col items-center justify-end pb-0 overflow-visible',
        className,
      )}
    >
      <div
        className="relative overflow-visible"
        style={{ height: columnHeight, width: columnWidth, zIndex: 30 }}
      >
        {/* Oversized, non-interactive overlay layer for the 3D canvas. */}
        <div
          className="pointer-events-none absolute overflow-visible [&_*]:!pointer-events-none"
          style={{
            top: -overscanY,
            left: -overscanX,
            width: overscanWidth,
            height: overscanHeight,
            zIndex: 30,
          }}
        >
          <DiceSet
            values={toFive(dice, 1)}
            held={toFive(lockedDice, false)}
            rolling={isRolling}
            resetKey={resetKey}
            cleared={!hasRolled && !isRolling && resetKey > 0}
            onRollComplete={() => {
              /* The game state owns roll timing; nothing to do here. */
            }}
            spacing={spacing}
            holdColor={HOLD_COLORS[playerIndex % HOLD_COLORS.length]}
            skin={skin}
            fill={1 / OVERSCAN}
            duration={1.3}
            className="h-full w-full"
          />
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

function readVar(name: string, fallback: number): number {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/** [dice size scale, gap scale]; the gap follows the dice unless --dice-gap-scale is set. */
function readDiceScale(): [number, number] {
  if (typeof document === 'undefined') return [1, 1];
  const d = readVar('--dice-scale', 1);
  return [d, readVar('--dice-gap-scale', d)];
}

/** Follows --dice-scale; it changes when the banner class or screen size changes. */
function useDiceScale(): [number, number] {
  const [scale, setScale] = useState(readDiceScale);
  useEffect(() => {
    const update = () => setScale((prev) => {
      const next = readDiceScale();
      return prev[0] === next[0] && prev[1] === next[1] ? prev : next;
    });
    // Read again after mount: rules like :has(.mp-game) only match once the page is in the DOM.
    update();
    const raf = requestAnimationFrame(update);
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
    window.addEventListener('resize', update);
    return () => { cancelAnimationFrame(raf); mo.disconnect(); window.removeEventListener('resize', update); };
  }, []);
  return scale;
}
