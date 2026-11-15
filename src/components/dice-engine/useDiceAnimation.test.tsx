import { useLayoutEffect } from 'react';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Group } from 'three';
import { useDiceAnimation } from './useDiceAnimation';
import { setDieFlying } from './await-store';

const frame = vi.hoisted(() => ({ current: (_: unknown, _delta: number) => {} }));
vi.mock('@react-three/fiber', () => ({ useFrame: (fn: typeof frame.current) => { frame.current = fn; } }));
vi.mock('./await-store', () => ({ isDiceAwaiting: () => false, setDieFlying: vi.fn() }));

type Props = { resetKey: number; rolling: boolean; held: boolean; cleared: boolean; value?: 1 | 2 | 3 | 4 | 5 | 6 };
const resting: Props = { resetKey: 5, rolling: false, held: false, cleared: false };

function mount(initial: Props = resting) {
  const group = new Group();
  const travel = new Group();
  const hook = renderHook((props: Props) => {
    const refs = useDiceAnimation({ ...props, value: props.value ?? 6, duration: 1.3, size: 1, index: 0 });
    useLayoutEffect(() => {
      // Emulate Three attaching scene objects before passive animation effects.
      Object.assign(refs.groupRef, { current: group });
      Object.assign(refs.travelRef, { current: travel });
    }, [refs.groupRef, refs.travelRef]);
  }, { initialProps: initial });
  return { ...hook, group, travel };
}
function advance(frames = 80, delta = 1 / 60) {
  act(() => { for (let i = 0; i < frames; i++) frame.current({}, delta); });
}

describe('dice recovery without changing game state', () => {
  it('smoothly lands on the corrected face when a roll is interrupted', () => {
    const { group, travel, rerender } = mount({ ...resting, value: 2 });
    rerender({ ...resting, rolling: true, value: 2 });
    advance(20);
    const pose = group.quaternion.clone();
    const position = travel.position.clone();
    rerender({ ...resting, rolling: false, value: 6 });
    expect(group.quaternion.angleTo(pose)).toBeLessThan(0.000001);
    expect(travel.position.distanceTo(position)).toBeLessThan(0.000001);
    advance(1);
    expect(group.quaternion.angleTo(pose)).toBeLessThan(0.8);
    advance(30);
    expect(travel.position.length()).toBe(0);
    const landed = group.quaternion.clone();
    rerender({ ...resting, value: 6 });
    expect(group.quaternion.angleTo(landed)).toBeLessThan(0.000001);
  });

  it('corrects a late face without starting an extra flight after landing', () => {
    const { travel, rerender } = mount({ ...resting, value: 2 });
    rerender({ ...resting, rolling: true, value: 2 });
    advance(150);
    expect(travel.position.length()).toBe(0);
    rerender({ ...resting, rolling: true, value: 6 });
    advance(1);
    expect(travel.position.length()).toBe(0);
    advance(30);
    expect(travel.position.length()).toBe(0);
  });
  beforeEach(() => { vi.clearAllMocks(); });

  it('does not replay a historical reset when recovering rolled dice', () => {
    const { travel } = mount();
    advance();
    expect(travel.position.length()).toBe(0);
  });

  it('keeps a held die visible when recovered during the other dice roll', () => {
    const { travel } = mount({ ...resting, rolling: true, held: true });
    advance();
    expect(travel.position.length()).toBe(0);
  });

  it('restores an intentionally cleared table offscreen', () => {
    const { travel } = mount({ ...resting, cleared: true });
    advance();
    expect(travel.position.length()).toBeCloseTo(11);
  });

  it('still sweeps on a real turn reset and stays hidden without a new roll', () => {
    const { travel, rerender } = mount();
    rerender({ ...resting, resetKey: 6, cleared: true });
    advance();
    expect(travel.position.length()).toBeCloseTo(11);
  });

  it('returns a queued roll if its timer ends before suspended frames resume', () => {
    const { travel, rerender } = mount();
    rerender({ ...resting, resetKey: 6, cleared: true });
    advance(4);
    rerender({ ...resting, resetKey: 6, rolling: true });
    // No frames: the app is suspended while the roll completion timer expires.
    rerender({ ...resting, resetKey: 6 });
    advance();
    expect(travel.position.length()).toBe(0);
  });

  it('allows the first roll to enter from a recovered cleared table', () => {
    const { travel, rerender } = mount({ ...resting, cleared: true });
    advance();
    expect(travel.position.length()).toBeCloseTo(11);
    rerender({ ...resting, rolling: true });
    advance(150);
    expect(travel.position.length()).toBe(0);
  });

  it('restores a die remounted mid-roll at rest without a new entry flight', () => {
    // Canvas recovery / orientation relayout remounts the die while rolling.
    const { travel, rerender } = mount({ ...resting, rolling: true, value: 4 });
    advance(1);
    expect(travel.position.length()).toBe(0);
    advance(40);
    expect(travel.position.length()).toBe(0);
    rerender({ ...resting, value: 4 });
    advance(10);
    expect(travel.position.length()).toBe(0);
    expect(setDieFlying).not.toHaveBeenCalledWith(0, true);
  });

  it('releases a die on unmount without announcing a landing', () => {
    const { rerender, unmount } = mount({ ...resting, value: 2 });
    rerender({ ...resting, rolling: true, value: 2 });
    advance(5);
    unmount();
    expect(setDieFlying).toHaveBeenLastCalledWith(0, false, false);
  });

  it('keeps requesting frames until the die is at rest, even at very low fps', () => {
    const { travel, rerender } = mount({ ...resting, value: 2 });
    rerender({ ...resting, rolling: true, value: 2 });
    rerender({ ...resting, rolling: false, value: 2 });
    const invalidate = vi.fn();
    // 3 fps for longer than the 2.6 s demand window: clamped deltas stretch it.
    act(() => { for (let i = 0; i < 8; i++) frame.current({ invalidate }, 1 / 3); });
    expect(invalidate).toHaveBeenCalled();
    act(() => { for (let i = 0; i < 200; i++) frame.current({ invalidate }, 1 / 3); });
    expect(travel.position.length()).toBe(0);
    invalidate.mockClear();
    act(() => { frame.current({ invalidate }, 1 / 3); });
    expect(invalidate).not.toHaveBeenCalled();
  });
});
