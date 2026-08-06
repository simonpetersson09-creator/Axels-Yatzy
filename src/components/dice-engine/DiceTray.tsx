/**
 * The tray: precision lighting, ground/shadow plane, responsive camera framing
 * and the vertical column of dice. Everything lives inside the R3F canvas.
 */
import { memo, useLayoutEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";
import type { PerspectiveCamera as PerspectiveCameraImpl } from "three";
import { Dice3D } from "./Dice3D";
import type { DiceValue } from "./types";

export interface DiceTrayProps {
  values: DiceValue[];
  held: boolean[];
  rolling: boolean;
  size: number;
  spacing: number;
  /** Fraction of the canvas the column should occupy (0.2–1). */
  fill: number;
  duration: number;
  onToggleHold?: ((index: number) => void) | undefined;
  /** Bump to play the end-of-turn reset sweep on every die. */
  resetKey?: number;
  /** Optional pip tint (any CSS colour). */
  pipColor?: string | undefined;
  /** Optional hold-ring tint (any CSS colour). */
  holdColor?: string | undefined;
}

function DiceTrayImpl({
  values,
  held,
  rolling,
  size,
  spacing,
  fill,
  duration,
  onToggleHold,
  resetKey = 0,
  pipColor,
  holdColor,
}: DiceTrayProps) {
  const cameraRef = useRef<PerspectiveCameraImpl>(null);
  const viewportWidth = useThree((s) => s.size.width);
  const viewportHeight = useThree((s) => s.size.height);

  const step = size + spacing;
  const columnHeight = values.length * step - spacing;
  const cameraAzimuth = (-135 * Math.PI) / 180;
  // A near-overhead tabletop view makes the top face clearly dominant while
  // retaining a narrow glimpse of the front and side faces for depth.
  const cameraElevation = (80 * Math.PI) / 180;
  const cameraPolar = Math.PI / 2 - cameraElevation;

  // Follow the camera's screen-up axis so the column stays perfectly straight
  // in the image. The previous depth-axis layout introduced a small diagonal
  // because depth is foreshortened by the angled perspective.
  // Screen-space basis vectors in world coordinates: the column follows
  // "screen up", and dice fly in along "screen right".
  const screenUp = useMemo<[number, number, number]>(
    () => [
      -Math.cos(cameraPolar) * Math.sin(cameraAzimuth),
      Math.sin(cameraPolar),
      -Math.cos(cameraPolar) * Math.cos(cameraAzimuth),
    ],
    [cameraAzimuth, cameraPolar],
  );
  const screenRight = useMemo<[number, number, number]>(
    () => [Math.cos(cameraAzimuth), 0, -Math.sin(cameraAzimuth)],
    [cameraAzimuth],
  );

  const positions = useMemo(
    () =>
      values.map((_, i) => {
        // Index 0 renders at the TOP of the screen so the 3D column matches the
        // DOM tap-target order (which is laid out top-to-bottom).
        const offset = ((values.length - 1) / 2 - i) * step;
        return [screenUp[0] * offset, screenUp[1] * offset, screenUp[2] * offset] as [
          number,
          number,
          number,
        ];
      }),
    [values.length, step, screenUp],
  );


  /**
   * Responsive framing: dolly the camera back until the whole vertical column
   * of dice fits with a comfortable margin, on any phone aspect ratio.
   */
  useLayoutEffect(() => {
    const cam = cameraRef.current;
    if (!cam) return;
    const vFov = (cam.fov * Math.PI) / 180;
    // `fill` scales the framing: a smaller value asks for more empty space
    // around the column, which reads as smaller dice inside the same box.
    const fillSafe = Math.min(Math.max(fill, 0.2), 1);
    const requiredHeight = (columnHeight * 1.04 + size * 0.55) / fillSafe;
    const distForHeight = requiredHeight / 2 / Math.tan(vFov / 2);
    const distForWidth =
      (size * 1.8) / fillSafe /
      2 /
      Math.tan(vFov / 2) /
      Math.max(viewportWidth / Math.max(viewportHeight, 1), 0.0001);
    const dist = Math.max(distForWidth, distForHeight) * 1.0;

    // Elevated three-quarter tabletop view: high enough for the top face to
    // lead the composition, with a leftward horizontal rotation for depth.
    cam.position.set(
      Math.sin(cameraPolar) * Math.sin(cameraAzimuth) * dist,
      Math.cos(cameraPolar) * dist,
      Math.sin(cameraPolar) * Math.cos(cameraAzimuth) * dist,
    );
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
  }, [
    viewportWidth,
    viewportHeight,
    columnHeight,
    size,
    fill,
    cameraAzimuth,
    cameraPolar,
  ]);

  return (
    <>
      <PerspectiveCamera ref={cameraRef} makeDefault fov={34} near={0.1} far={100} />

      {/* Product-studio lighting: strong left key, restrained fill, rim separation.
          Lower ambient + fill and a harder key from the left gives the dice
          clearly readable form shading instead of flat, evenly lit faces. */}
      <ambientLight intensity={0.18} />
      <hemisphereLight args={["#eef2f4", "#14171a", 0.32]} />
      <directionalLight
        position={[-6.5, 8.5, 3.5]}
        intensity={3.1}
        color="#fff6e8"
        /* No shadow map: grounding is done with cheap painted blobs per die,
           so a real 2048² shadow pass would cost GPU time for nothing. */
      />
      {/* Soft bounce fill from the opposite side keeps shadow sides readable. */}
      <directionalLight position={[5, 2, -4]} intensity={0.3} color="#cfdae8" />
      {/* Subtle rim so each die separates from the dark background. */}
      <directionalLight position={[1.5, -2.5, -6]} intensity={0.42} color="#9fb0c2" />

      {/* Lighting stays local so the scene also works reliably in an iOS WebView. */}

      {values.map((value, i) => (
        <Dice3D
          key={i}
          index={i}
          value={value}
          held={held[i] ?? false}
          rolling={rolling}
          size={size}
          duration={duration}
          position={positions[i] ?? [0, 0, 0]}
          screenRight={screenRight}
          screenUp={screenUp}
          resetKey={resetKey}
          pipColor={pipColor}
          holdColor={holdColor}
          onTap={onToggleHold}
        />
      ))}


    </>
  );
}

export const DiceTray = memo(DiceTrayImpl);
