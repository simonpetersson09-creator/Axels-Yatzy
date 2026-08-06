/**
 * `<DiceScene />` — the public entry point of the dice engine.
 *
 * It owns nothing but presentation: values, held state and the rolling flag
 * are fully controlled by the parent. The component never generates values.
 *
 *   <DiceScene
 *     values={[6, 2, 5, 1, 3]}
 *     held={[false, true, false, false, true]}
 *     rolling={rolling}
 *     onToggleHold={(index) => {}}
 *   />
 */
import { memo, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { ACESFilmicToneMapping, SRGBColorSpace } from "three";
import { DiceTray } from "./DiceTray";
import type { DiceSceneProps } from "./types";

const EMPTY_HELD: boolean[] = [];

/**
 * Stable camera descriptor. It MUST be a module constant: an inline object is
 * re-applied by R3F on every resize/render and would undo the responsive
 * framing performed inside <DiceTray />.
 */
const CAMERA_PROPS = { fov: 34, near: 0.1, far: 100, position: [0, 6, 9] } as const;

function DiceSceneImpl({
  values,
  held = EMPTY_HELD,
  rolling = false,
  size = 1,
  spacing = 0.35,
  fill = 1,
  duration = 1.1,
  onToggleHold,
  className,
}: DiceSceneProps) {
  const heldSafe = useMemo(
    () => values.map((_, i) => held[i] ?? false),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [values.length, held],
  );

  return (
    <div className={className ?? "h-full w-full"}>
      <Canvas
        // The dice occupy a narrow strip, so edge quality matters more than
        // fill rate here: allow the device's full DPR (up to 3) for crisp,
        // supersampled silhouettes and pips on modern phones.
        dpr={[1, 3]}
        
        
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
          // Avoids iOS WebView context loss when the canvas is re-composited.
          preserveDrawingBuffer: false,
        }}
        camera={CAMERA_PROPS}
        onCreated={({ gl }) => {
          gl.toneMapping = ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          gl.outputColorSpace = SRGBColorSpace;
        }}
        style={{ touchAction: "manipulation" }}
      >
        <DiceTray
          values={values}
          held={heldSafe}
          rolling={rolling}
          size={size}
          spacing={spacing}
          fill={fill}
          duration={duration}
          onToggleHold={onToggleHold}
        />
      </Canvas>
    </div>
  );
}

export const DiceScene = memo(DiceSceneImpl);
export default DiceScene;
