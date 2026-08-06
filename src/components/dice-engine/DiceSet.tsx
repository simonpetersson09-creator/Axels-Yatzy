/**
 * `<DiceSet />` — the portable public API of the dice engine.
 *
 * Purely presentational: it never generates values, never decides what is
 * held and never owns a roll timer of its own beyond reporting when the
 * animation it was asked to play has finished.
 *
 *   <DiceSet
 *     values={[6, 2, 5, 1, 3]}
 *     held={[false, true, false, false, true]}
 *     rolling={rolling}
 *     onDieClick={(i) => toggleHold(i)}
 *     onRollComplete={() => setRolling(false)}
 *   />
 */
import { memo, useEffect, useRef } from "react";
import { DiceScene } from "./DiceScene";
import type { DiceConfig, DiceValue } from "./types";

export type DiceSetProps = {
  values: [number, number, number, number, number];
  held: [boolean, boolean, boolean, boolean, boolean];
  rolling: boolean;
  onDieClick?: (index: number) => void;
  onRollComplete?: () => void;
  /** Bump to play the end-of-turn reset sweep (dice sweep out and back in). */
  resetKey?: number;
  /** Optional pip tint (any CSS colour), e.g. the active player's colour. */
  pipColor?: string | undefined;
} & DiceConfig & {
    /** Optional className for the wrapper (fills its container by default). */
    className?: string;
  };

const clampValue = (n: number): DiceValue =>
  (Math.min(6, Math.max(1, Math.round(n))) as DiceValue);

function DiceSetImpl({
  values,
  held,
  rolling,
  onDieClick,
  onRollComplete,
  size = 1,
  spacing = 0.35,
  fill = 1,
  duration = 1.1,
  resetKey = 0,
  pipColor,
  className,
}: DiceSetProps) {
  const safeValues = values.map(clampValue);
  const completeRef = useRef(onRollComplete);
  completeRef.current = onRollComplete;

  // The engine staggers dice by index * 0.04 s and runs each die for
  // ~0.85 * duration, plus a short settle. One timer covers the whole set.
  useEffect(() => {
    if (!rolling) return;
    const total = duration * 0.9 + values.length * 0.04 + 0.15;
    const id = window.setTimeout(() => completeRef.current?.(), total * 1000);
    return () => window.clearTimeout(id);
  }, [rolling, duration, values.length]);

  return (
    <DiceScene
      values={safeValues}
      held={held}
      rolling={rolling}
      size={size}
      spacing={spacing}
      fill={fill}
      duration={duration}
      resetKey={resetKey}
      pipColor={pipColor}
      {...(onDieClick ? { onToggleHold: onDieClick } : {})}
      {...(className ? { className } : {})}
    />
  );
}

export const DiceSet = memo(DiceSetImpl);
export default DiceSet;
