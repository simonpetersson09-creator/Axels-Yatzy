/**
 * Visual "locked / kept for next roll" affordance for a single die.
 *
 * Purely presentational: a thin precision ring that scales in, breathes slowly
 * and fades out again when the die is released. No game logic lives here.
 */
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { DoubleSide, Group, Mesh, MeshBasicMaterial } from "three";

// Matches the roll button gold: hsl(36 78% 55%) === #e69e33
const ringMaterial = new MeshBasicMaterial({
  color: "#e69e33",
  transparent: true,
  depthWrite: false,
  opacity: 0,
  side: DoubleSide,
});

export interface HoldIndicatorProps {
  held: boolean;
  size: number;
  /** Deterministic phase offset so dice don't breathe in lock-step. */
  phase?: number;
}

export function HoldIndicator({ held, size, phase = 0 }: HoldIndicatorProps) {
  const groupRef = useRef<Group>(null);
  const ringRef = useRef<Mesh>(null);
  // 0 = released, 1 = fully locked. Eased every frame for a smooth transition.
  const t = useRef(0);

  useFrame((state, delta) => {
    const target = held ? 1 : 0;
    // Critically-damped-ish approach: quick in, gentle out.
    const speed = held ? 9 : 6;
    t.current += (target - t.current) * Math.min(1, delta * speed);
    const k = t.current;

    const group = groupRef.current;
    if (group) group.visible = k > 0.005;
    if (!group || !group.visible) return;

    const ring = ringRef.current;
    if (!ring) return;

    const breathe = 1 + Math.sin(state.clock.elapsedTime * 1.9 + phase) * 0.035;
    const material = ring.material as MeshBasicMaterial;
    material.opacity = k * 0.85;
    // Slight overshoot on lock-in makes the ring feel snappy.
    const scale = (0.82 + k * 0.18) * breathe;
    ring.scale.set(scale, scale, scale);
    ring.rotation.z += delta * 0.25;
  });

  return (
    <group ref={groupRef} position={[0, -size * 0.6, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh ref={ringRef} material={ringMaterial} renderOrder={3}>
        <ringGeometry args={[size * 0.74, size * 0.79, 64]} />
      </mesh>
    </group>
  );
}
