/**
 * Visual "locked / kept for next roll" affordance for a single die.
 *
 * Purely presentational: a thin precision ring that scales in, breathes slowly
 * and fades out again when the die is released. No game logic lives here.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { DoubleSide, Group, Mesh, MeshBasicMaterial } from "three";

// Default matches the roll button gold: hsl(36 78% 55%) === #e69e33
const DEFAULT_COLOR = "#e69e33";

export interface HoldIndicatorProps {
  held: boolean;
  size: number;
  /** Deterministic phase offset so dice don't breathe in lock-step. */
  phase?: number;
  /** Ring tint (any CSS colour). Defaults to the roll-button gold. */
  color?: string | undefined;
}

export function HoldIndicator({ held, size, phase = 0, color }: HoldIndicatorProps) {
  // One material per die so each ring can carry the active player's colour.
  const ringMaterial = useMemo(
    () =>
      new MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        opacity: 0,
        side: DoubleSide,
      }),
    [],
  );
  useEffect(() => () => ringMaterial.dispose(), [ringMaterial]);
  useEffect(() => {
    ringMaterial.color.set(color ?? DEFAULT_COLOR);
  }, [ringMaterial, color]);

  const groupRef = useRef<Group>(null);
  const ringRef = useRef<Mesh>(null);
  // 0 = released, 1 = fully locked. Eased every frame for a smooth transition.
  const t = useRef(0);

  useFrame((state, delta) => {
    const target = held ? 1 : 0;
    // Quick in, and an equally snappy release so unlocking feels instant.
    const speed = held ? 9 : 26;
    t.current += (target - t.current) * Math.min(1, delta * speed);
    if (!held && t.current < 0.02) t.current = 0;
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
