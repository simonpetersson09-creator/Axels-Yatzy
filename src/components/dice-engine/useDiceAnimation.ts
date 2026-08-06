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
}

const DEFAULT_RIGHT: [number, number, number] = [1, 0, 0];
const DEFAULT_UP: [number, number, number] = [0, 1, 0];

export function useDiceAnimation({
  value,
  rolling,
  held,
  duration,
  index,
  size,
  screenRight = DEFAULT_RIGHT,
  screenUp = DEFAULT_UP,
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
      if (state.settledValue !== value) {
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
    state.settling = false;
    state.animating = true;
    state.rollValue = value;

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolling, held, value, duration, reducedMotion, index, size]);


  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

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
