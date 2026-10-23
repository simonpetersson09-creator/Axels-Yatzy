import { useLayoutEffect } from 'react';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Group } from 'three';
import { useDiceAnimation } from './useDiceAnimation';

const frame = vi.hoisted(() => ({ current: (_: unknown, _delta: number) => {} }));
vi.mock('@react-three/fiber', () => ({ useFrame: (fn: typeof frame.current) => { frame.current = fn; } }));
vi.mock('./await-store', () => ({ isDiceAwaiting: () => false, setDieFlying: vi.fn() }));

type Props = { resetKey: number; rolling: boolean; held: boolean; cleared: boolean };
const resting: Props = { resetKey: 5, rolling: false, held: false, cleared: false };

function mount(initial: Props = resting) {
  const group = new Group();
  const travel = new Group();
  const hook = renderHook((props: Props) => {
    const refs = useDiceAnimation({ ...props, value: 6, duration: 1.3, size: 1, index: 0 });
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
});