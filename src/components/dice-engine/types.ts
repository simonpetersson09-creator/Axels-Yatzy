/**
 * Shared types for the reusable 3D dice engine.
 *
 * This module (and every other file in `src/components/dice-engine/`) is completely
 * self-contained: it has no dependency on the surrounding demo app. Copy the
 * folder into any React project that has `three`, `@react-three/fiber` and
 * `@react-three/drei` installed and it will work as-is.
 */

/** A valid die face value. */
export type DiceValue = 1 | 2 | 3 | 4 | 5 | 6;

/** Visual/behavioural configuration shared by the tray and each die. */
export interface DiceConfig {
  /** Edge length of a single die in world units. Default: 1. */
  size?: number;
  /** Gap between two neighbouring dice in world units. Default: 0.35. */
  spacing?: number;
  /**
   * How much of the canvas the dice column occupies, 0.2–1.
   * 1 = fills the container edge to edge, 0.7 = 30 % breathing room.
   * This is the knob to use when fitting the engine into an existing layout:
   * the container decides the area, `fill` decides how big the dice read
   * inside it. Default: 1.
   */
  fill?: number;
  /** Base roll duration in seconds. Slightly varied per die. Default: 1.1. */
  duration?: number;
}

export interface DiceSceneProps extends DiceConfig {
  /** Face values to display. The scene renders exactly `values.length` dice. */
  values: DiceValue[];
  /** Held state per die. Held dice never animate and are visually marked. */
  held?: boolean[];
  /** When flipped to `true`, every non-held die replays its roll animation. */
  rolling?: boolean;
  /** Bump this number to play the end-of-turn reset sweep. */
  resetKey?: number;
  /** Optional pip tint (any CSS colour), e.g. the active player's colour. */
  pipColor?: string | undefined;
  /** Optional hold-ring tint (any CSS colour), e.g. the active player's colour. */
  holdColor?: string | undefined;
  /** Fired when a die is tapped/clicked. */
  onToggleHold?: (index: number) => void;
  /** Optional className for the wrapping element (full size by default). */
  className?: string;
}
