/**
 * Animation driver for a single die.
 *
 * Design notes:
 * - Runs entirely inside `useFrame`; it never calls `setState`, so a rolling
 *   die triggers zero React re-renders.
 * - All vector/quaternion objects are allocated once per die (refs), so the
 *   frame loop performs no allocations and produces no GC pressure.
 * - The final orientation is computed up-front from the requested value, so
 *   the die is guaranteed to land on the correct face.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Group, Quaternion, Vector3 } from "three";
import {
  bounceHeight,
  easeOutCubic,
  easeOutQuart,
  getFaceQuaternion,
  randomAxis,
  randomInt,
} from "./diceRotations";
import type { DiceValue } from "./types";

/** Respects the OS "reduce motion" setting; animations become near-instant. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

interface Options {
  value: DiceValue;
  /** Toggling this to `true` starts a new roll. */
  rolling: boolean;
  /** Held dice keep their orientation and skip the animation entirely. */
  held: boolean;
  /** Base duration in seconds. */
  duration: number;
  /** Die index, used to stagger and vary the animation. */
  index: number;
  /** Die size, used to scale the bounce height. */
  size: number;
  /** World vector pointing right on screen — the entry direction. */
  screenRight?: [number, number, number] | undefined;
  /** World vector pointing up on screen — the bounce direction. */
  screenUp?: [number, number, number] | undefined;
  /**
   * Bump this number to play the "clear the table" reset: the dice sweep out
   * to the right (the direction they enter from), then glide back in on a
   * neutral orientation. Used when a turn ends.
   */
  resetKey?: number;
}


const DEFAULT_RIGHT: [number, number, number] = [1, 0, 0];
const DEFAULT_UP: [number, number, number] = [0, 1, 0];

const easeInCubic = (t: number) => t * t * t;
/** Deterministic 0–1 variation per die index (no per-frame randomness). */
const jitterFor = (index: number) => {
  const x = Math.sin((index + 1) * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};


export function useDiceAnimation({
  value,
  rolling,
  held,
  duration,
  index,
  size,
  screenRight = DEFAULT_RIGHT,
  screenUp = DEFAULT_UP,
  resetKey = 0,
}: Options) {

  const groupRef = useRef<Group>(null);
  /** Non-rotated outer group: carries the fly-in/bounce translation. */
  const travelRef = useRef<Group>(null);
  const reducedMotion = usePrefersReducedMotion();

  // Per-die scratch objects — allocated once, mutated in place every frame.
  const state = useMemo(
    () => ({
      target: new Quaternion(),
      offsetA: new Quaternion(),
      offsetB: new Quaternion(),
      axisA: randomAxis(new Vector3()),
      axisB: randomAxis(new Vector3()),
      right: new Vector3(1, 0, 0),
      up: new Vector3(0, 1, 0),
      move: new Vector3(),
      /** Orientation a smooth catch-up settle starts from. */
      settleFrom: new Quaternion(),
      settleT: 0,
      settling: false,
      turnsA: 2,
      turnsB: 1,
      elapsed: 0,
      duration,
      delay: 0,
      animating: false,
      /** How far off-screen (to the right) the die starts. */
      entry: 0,
      /** Value the die is currently resting on (-1 = never settled). */
      settledValue: -1 as number,
      /** Value the currently running animation resolves to. */
      rollValue: -1 as number,
      /* --- turn-reset sweep ------------------------------------------- */
      /** true while the "clear the table" sweep is running. */
      sweeping: false,
      sweepT: 0,
      sweepDelay: 0,
      sweepDuration: 0.78,
      sweepDistance: 0,
      /** Orientation the sweep starts from (current resting pose). */
      sweepFrom: new Quaternion(),
      sweepSpin: new Quaternion(),
      sweepAxis: randomAxis(new Vector3()),
      /** A roll requested while the sweep is still on its way out. */
      pendingRoll: false,
    }),
    [duration],
  );

  /** Snap immediately to the requested face (used on mount and for held dice). */
  const settle = () => {
    const group = groupRef.current;
    if (!group) return;
    getFaceQuaternion(value, randomInt(0, 3), state.target);
    group.quaternion.copy(state.target);
    travelRef.current?.position.set(0, 0, 0);
    state.settledValue = value;
  };

  /**
   * Turn reset: sweep the dice off to the right (mirroring how they enter),
   * then glide them back in on a clean, neutral orientation.
   *
   * NOTE: this effect is declared *before* the roll effect on purpose. When a
   * turn ends, the new (reset) dice values and the bumped `resetKey` arrive in
   * the same commit; running the sweep first means `state.sweeping` is already
   * true when the value effect runs, so it can never hard-snap the die to the
   * new number while it is still on screen.
   */
  useEffect(() => {
    if (!resetKey) return;
    const group = groupRef.current;
    if (!group) return;

    if (reducedMotion) {
      settle();
      return;
    }

    state.sweepFrom.copy(group.quaternion);
    // Land straight, without the random yaw variation used after a roll.
    getFaceQuaternion(value, 0, state.target);
    randomAxis(state.sweepAxis);
    state.sweepT = 0;
    state.sweepDelay = index * 0.05;
    state.sweepDuration = 0.8;
    state.sweepDistance = size * (10 + jitterFor(index) * 2);
    state.settling = false;
    state.animating = false;
    state.sweeping = true;
    state.settledValue = value;

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // Start / restart a roll whenever `rolling` flips on (held dice are skipped).
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    if (!rolling || held) {
      if (state.animating) {
        // Interrupted mid-roll (rolling window ended early, or the die was
        // held while tumbling): glide to the exact target orientation over a
        // few frames instead of hard-snapping, which reads as the number
        // suddenly changing after the die looked like it had landed.
        state.settleFrom.copy(group.quaternion);
        state.settleT = 0;
        state.settling = true;
        state.settledValue = state.rollValue;
        state.animating = false;
      }
      // Never re-snap a die that already shows the requested value: doing so
      // would pick a new random yaw and make the number appear to change when
      // the roll finishes.
      if (state.sweeping) {
        // A value change arriving during the sweep must not touch the visible
        // pose — the die keeps its number all the way out and only adopts the
        // new one once it is off-screen (handled by the sweep's return leg).
        getFaceQuaternion(value, 0, state.target);
        state.settledValue = value;
      } else if (state.settledValue !== value) {
        state.settling = false;
        settle();
      }

      state.animating = false;
      return;
    }

    getFaceQuaternion(value, randomInt(0, 3), state.target);
    randomAxis(state.axisA);
    randomAxis(state.axisB);
    // Livelier tumble: more revolutions while still landing exactly on target.
    state.turnsA = randomInt(3, 5);
    state.turnsB = randomInt(2, 3);
    state.elapsed = 0;
    // Keep the total (delay + duration) well inside a ~1.6 s roll window, with
    // margin for dropped frames, so `rolling` rarely cuts the animation short.
    state.duration = reducedMotion ? 0.18 : duration * (0.8 + Math.random() * 0.1);
    state.delay = reducedMotion ? 0 : index * 0.04;
    // Every die enters from off-screen right, with a little per-die variance.
    state.entry = reducedMotion ? 0 : size * (11 + Math.random() * 2.5);

    // A roll starting while the end-of-turn sweep is still running (typical at
    // hand-off) must not teleport the die, but it must also not shorten its
    // entry — every die has to fly in with exactly the same motion. So we let
    // the sweep finish its out-leg first (sped up), and only then start the
    // completely normal roll from off-screen.
    state.settling = false;
    if (state.sweeping && !reducedMotion) {
      state.pendingRoll = true;
      state.animating = false;
    } else {
      state.sweeping = false;
      state.pendingRoll = false;
      state.animating = true;
    }
    state.elapsed = 0;

    state.rollValue = value;

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolling, held, value, duration, reducedMotion, index, size]);



  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    if (state.sweeping) {
      state.right.set(screenRight[0], screenRight[1], screenRight[2]).normalize();
      state.up.set(screenUp[0], screenUp[1], screenUp[2]).normalize();

      // When a roll is queued we only need the out-leg, and fast: rush it so
      // the die is off-screen quickly and the real roll can start.
      state.sweepT += Math.min(delta, 1 / 20) * (state.pendingRoll ? 3 : 1);
      if (state.pendingRoll) state.sweepDelay = 0;
      const t = Math.min(
        Math.max((state.sweepT - state.sweepDelay) / state.sweepDuration, 0),
        1,
      );

      // 0 → 0.44: accelerate off-screen right. 0.44 → 1: glide back in.
      const OUT = 0.44;
      let offset: number;
      let lift: number;
      let angle: number;
      if (t < OUT) {
        const k = easeInCubic(t / OUT);
        offset = state.sweepDistance * k;
        lift = size * 0.22 * Math.sin(Math.PI * k);
        angle = k * Math.PI * 1.2;
        // Keep the exact face the die landed on all the way out — the number
        // must not change while the die is still visible.
        group.quaternion.copy(state.sweepFrom);

      } else {
        const u = (t - OUT) / (1 - OUT);
        offset = state.sweepDistance * (1 - easeOutQuart(u));
        lift = bounceHeight(u, size * 0.45);
        angle = (1 - easeOutCubic(u)) * Math.PI * 1.2;
        group.quaternion.copy(state.target);
      }
      state.sweepSpin.setFromAxisAngle(state.sweepAxis, angle);
      group.quaternion.multiply(state.sweepSpin);

      const travelSweep = travelRef.current;
      if (travelSweep) {
        state.move
          .copy(state.right)
          .multiplyScalar(offset)
          .addScaledVector(state.up, lift);
        travelSweep.position.copy(state.move);
      }

      // Queued roll: hand over the moment the die is off-screen, entering from
      // exactly where it is, so the fly-in matches a normal roll one-to-one.
      if (state.pendingRoll && t >= OUT) {
        state.entry = state.sweepDistance;
        state.sweeping = false;
        state.pendingRoll = false;
        state.animating = true;
        state.elapsed = 0;
        return;
      }

      if (t >= 1) {
        group.quaternion.copy(state.target);
        travelSweep?.position.set(0, 0, 0);
        state.sweeping = false;
      }
      return;
    }


    if (state.settling) {
      state.settleT = Math.min(state.settleT + delta / 0.22, 1);
      group.quaternion
        .copy(state.settleFrom)
        .slerp(state.target, easeOutCubic(state.settleT));
      const travelNow = travelRef.current;
      if (travelNow) travelNow.position.multiplyScalar(1 - easeOutCubic(state.settleT));
      if (state.settleT >= 1) {
        group.quaternion.copy(state.target);
        travelNow?.position.set(0, 0, 0);
        state.settling = false;
      }
      return;
    }

    if (!state.animating) return;

    state.right.set(screenRight[0], screenRight[1], screenRight[2]).normalize();
    state.up.set(screenUp[0], screenUp[1], screenUp[2]).normalize();

    state.elapsed += Math.min(delta, 1 / 20); // clamp to survive frame drops
    const t = Math.min(Math.max((state.elapsed - state.delay) / state.duration, 0), 1);

    // Two decaying rotations around independent axes -> natural tumbling.
    // Both use whole turns, so they resolve to identity exactly at t = 1,
    // which guarantees the requested face ends up upwards.
    const a = (1 - easeOutCubic(t)) * state.turnsA * Math.PI * 2;
    const b = (1 - easeOutQuart(t)) * state.turnsB * Math.PI * 2;
    state.offsetA.setFromAxisAngle(state.axisA, a);
    state.offsetB.setFromAxisAngle(state.axisB, b);
    group.quaternion.copy(state.target).multiply(state.offsetA).multiply(state.offsetB);

    // Slide in from the right: the horizontal travel resolves at t = 0.7,
    // exactly where `bounceHeight` switches from the toss arc to the single
    // damped bounce, so the die lands and settles in one continuous motion.
    const th = Math.min(t / 0.7, 1);
    const travelOffset = state.entry * (1 - easeOutCubic(th));
    const lift = bounceHeight(t, size * 0.6);

    const travel = travelRef.current;
    if (travel) {
      state.move
        .copy(state.right)
        .multiplyScalar(travelOffset)
        .addScaledVector(state.up, lift);
      travel.position.copy(state.move);
    }

    if (t >= 1) {
      group.quaternion.copy(state.target);
      travel?.position.set(0, 0, 0);
      state.animating = false;
      state.settledValue = state.rollValue;
    }
  });

  return { groupRef, travelRef };
}
