/**
 * A single premium-looking 3D die.
 *
 * Geometry: one rounded/bevelled cube (drei `RoundedBox`) plus recessed
 * sphere pips. Geometries and materials are created once at module level and
 * shared by every die instance, keeping GPU state changes and memory low.
 */
import { memo, useMemo, useRef } from "react";
import { RoundedBox } from "@react-three/drei";
import {
  CanvasTexture,
  DoubleSide,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,

  SRGBColorSpace,
} from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";

import { useDiceAnimation } from "./useDiceAnimation";
import { HoldIndicator } from "./HoldIndicator";
import type { DiceValue } from "./types";

/* ---------------------------------------------------------------- shared */

/**
 * Polished resin body: a clear-coated ivory with a very tight specular
 * highlight, the way a real cast-resin die photographs in a product studio.
 */
const bodyMaterial = new MeshPhysicalMaterial({
  color: "#f6f1e6",
  roughness: 0.32,
  metalness: 0,
  clearcoat: 0.85,
  clearcoatRoughness: 0.12,
  sheen: 0.25,
  sheenColor: "#fffaf0",
  envMapIntensity: 1.05,
  // Micro-thickness translucency: resin never reads as pure opaque plastic.
  transmission: 0,
  ior: 1.48,
});

/** Held dice warm and darken slightly so the state reads instantly. */
const heldMaterial = new MeshPhysicalMaterial({
  color: "#e3d7bf",
  roughness: 0.28,
  metalness: 0,
  clearcoat: 0.9,
  clearcoatRoughness: 0.1,
  sheen: 0.3,
  sheenColor: "#fff3dd",
  envMapIntensity: 1.15,
  ior: 1.48,
});

/** Deep black pips with a faint, ink-like gloss. */
const pipMaterial = new MeshStandardMaterial({
  color: "#0b0b0c",
  roughness: 0.34,
  metalness: 0.02,
  envMapIntensity: 0.5,
});

const pipGeometry = new SphereGeometry(1, 32, 22);

/**
 * Pips can be tinted to the active player's colour. Materials are cached per
 * colour so switching players never allocates a new material each frame.
 */
const pipMaterialCache = new Map<string, MeshStandardMaterial>();
function getPipMaterial(color?: string): MeshStandardMaterial {
  if (!color) return pipMaterial;
  const cached = pipMaterialCache.get(color);
  if (cached) return cached;
  const mat = pipMaterial.clone();
  mat.color.set(color);
  pipMaterialCache.set(color, mat);
  return mat;
}

/** Soft blurred blob used as a per-die grounding shadow. */
function createShadowTexture(): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const s = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(0,0,0,0.55)");
  g.addColorStop(0.45, "rgba(0,0,0,0.26)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const shadowTexture = createShadowTexture();
const shadowMaterial = shadowTexture
  ? new MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      depthWrite: false,
      opacity: 0.75,
      side: DoubleSide,
    })
  : null;

/**
 * Fake ambient occlusion ring: a soft dark halo that hugs each pip so the pip
 * reads as sunk into the resin instead of painted on top of it.
 */
function createPipAoTexture(): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const s = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(0,0,0,0.5)");
  g.addColorStop(0.42, "rgba(0,0,0,0.42)");
  g.addColorStop(0.62, "rgba(0,0,0,0.16)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const pipAoTexture = createPipAoTexture();
const pipAoMaterial = pipAoTexture
  ? new MeshBasicMaterial({
      map: pipAoTexture,
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
    })
  : null;

const pipAoGeometry = new PlaneGeometry(1, 1);


/** Pip layout in unit-face coordinates (range -1..1 within the face). */
const PIP_LAYOUT: Record<DiceValue, [number, number][]> = {
  1: [[0, 0]],
  2: [
    [-1, 1],
    [1, -1],
  ],
  3: [
    [-1, 1],
    [0, 0],
    [1, -1],
  ],
  4: [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ],
  5: [
    [-1, -1],
    [-1, 1],
    [0, 0],
    [1, -1],
    [1, 1],
  ],
  6: [
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [1, -1],
    [1, 0],
    [1, 1],
  ],
};

/** Face definitions matching `diceRotations.ts`. */
const FACES: { value: DiceValue; rotation: [number, number, number] }[] = [
  { value: 1, rotation: [-Math.PI / 2, 0, 0] }, // +Y
  { value: 6, rotation: [Math.PI / 2, 0, 0] }, // -Y
  { value: 3, rotation: [0, Math.PI / 2, 0] }, // +X
  { value: 4, rotation: [0, -Math.PI / 2, 0] }, // -X
  { value: 2, rotation: [0, 0, 0] }, // +Z
  { value: 5, rotation: [0, Math.PI, 0] }, // -Z
];

/* ------------------------------------------------------------------ pips */

function FacePips({ value, size, pipColor }: { value: DiceValue; size: number; pipColor?: string | undefined }) {
  const material = getPipMaterial(pipColor);
  const pipRadius = size * 0.085;
  const offset = size * 0.24;
  // Keep a thin visible dome above the face while avoiding protruding spheres.
  const depth = size * 0.5 + pipRadius * 0.03;

  return (
    <>
      {PIP_LAYOUT[value].map(([u, v], i) => (
        <group key={i} position={[u * offset, v * offset, 0]}>
          {/* Contact shading around the pip sells the engraved depth. */}
          {pipAoMaterial && (
            <mesh
              geometry={pipAoGeometry}
              material={pipAoMaterial}
              position={[0, 0, size * 0.5 + size * 0.0008]}
              scale={[pipRadius * 3.1, pipRadius * 3.1, 1]}
              renderOrder={1}
            />
          )}
          <mesh
            geometry={pipGeometry}
            material={material}
            position={[0, 0, depth]}
            scale={[pipRadius, pipRadius, pipRadius * 0.12]}
            renderOrder={2}
          />
        </group>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------- die */

/** Deterministic 0..1 pseudo-random per die index (stable across renders). */
function jitter(index: number, salt: number): number {
  const x = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export interface Dice3DProps {
  value: DiceValue;
  held: boolean;
  rolling: boolean;
  index: number;
  size: number;
  duration: number;
  position: [number, number, number];
  screenRight?: [number, number, number] | undefined;
  screenUp?: [number, number, number] | undefined;
  onTap?: ((index: number) => void) | undefined;
  /** Bump to play the end-of-turn sweep-out/sweep-in reset. */
  resetKey?: number;
  /** Optional pip tint (any CSS colour). Defaults to near-black ink. */
  pipColor?: string | undefined;
}

function Dice3DImpl({
  value,
  held,
  rolling,
  index,
  size,
  duration,
  position,
  screenRight,
  screenUp,
  onTap,
  resetKey,
  pipColor,
}: Dice3DProps) {
  const { groupRef, travelRef } = useDiceAnimation({
    value,
    rolling,
    held,
    duration,
    index,
    size,
    screenRight,
    screenUp,
    resetKey: resetKey ?? 0,
  });

  // Tactile press feedback: tapping a die dips it to ~0.96 and springs back,
  // so locking/unlocking feels physical rather than instant.
  const pressRef = useRef<Group>(null);
  const pressAmount = useRef(0);

  useFrame((_, delta) => {
    const g = pressRef.current;
    if (!g) return;
    if (pressAmount.current > 0.0005) {
      pressAmount.current *= Math.exp(-9 * delta);
    } else if (pressAmount.current !== 0) {
      pressAmount.current = 0;
    }
    // Slight overshoot on the way back for a springy, haptic feel.
    const s = 1 - 0.04 * pressAmount.current + 0.012 * Math.sin(pressAmount.current * Math.PI);
    g.scale.setScalar(s);
  });

  const handleClick = useMemo(
    () => (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      pressAmount.current = 1;
      onTap?.(index);
    },
    [onTap, index],
  );


  // Hand-placed feel: ±10° yaw and ±3° roll per die, deterministic per index.
  const yawJitter = ((jitter(index, 1) * 2 - 1) * 10 * Math.PI) / 180;
  const rollJitter = ((jitter(index, 3) * 2 - 1) * 3 * Math.PI) / 180;
  const tiltJitter = ((jitter(index, 5) * 2 - 1) * 1.5 * Math.PI) / 180;

  return (
    // Outer group = fixed slot position. Travel group = unrotated, so the
    // fly-in translation happens in world/screen space. Inner group = animated
    // orientation, which never needs to know where the die sits in the tray.
    <group position={position}>
      <group ref={travelRef}>
        {/* Very soft grounding blob — kept outside the yaw group so it stays
            in world space, offset away from the key light (which comes from
            the upper left) so the die reads as resting, not hovering. */}
        {shadowMaterial && (
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[size * 0.2, -size * 0.62, size * 0.14]}
            scale={[1, 0.86, 1]}
            material={shadowMaterial}
            renderOrder={-1}
          >
            <planeGeometry args={[size * 2.6, size * 2.6]} />
          </mesh>
        )}
        <group rotation={[0, -Math.PI / 4 + yawJitter, 0]}>

          {/* Locked-for-next-roll affordance: halo + precision ring. */}
          <HoldIndicator held={held} size={size} phase={index * 1.3} />
          {/* Held dice sit a touch lower, like they've been set down. */}
          <group position={[0, held ? -size * 0.06 : 0, 0]} rotation={[tiltJitter, 0, rollJitter]}>
            <group ref={pressRef}>
              <group ref={groupRef} onPointerDown={handleClick}>
                <RoundedBox
                  args={[size, size, size]}
                  radius={size * 0.2}
                  smoothness={10}
                  bevelSegments={8}
                  creaseAngle={0.5}
                  material={held ? heldMaterial : bodyMaterial}
                />
                {FACES.map((face) => (
                  <group key={face.value} rotation={face.rotation}>
                    <FacePips value={face.value} size={size} pipColor={pipColor} />
                  </group>
                ))}
              </group>
            </group>
          </group>

        </group>
      </group>
    </group>
  );
}


/** Memoised: a die only re-renders when its own props change. */
export const Dice3D = memo(Dice3DImpl);
