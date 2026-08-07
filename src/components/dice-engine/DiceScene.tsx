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
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { ACESFilmicToneMapping, SRGBColorSpace } from "three";
import { DiceTray } from "./DiceTray";
import type { DiceSceneProps } from "./types";

const EMPTY_HELD: boolean[] = [];

/**
 * Compiles every material in the scene as soon as the canvas exists, so the
 * first animated frame (the fly-in of the very first roll) never pays for
 * shader compilation and texture upload.
 */
function Warmup() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    try {
      gl.compile(scene, camera);
      gl.render(scene, camera);
    } catch {
      /* Warmup is best-effort only. */
    }
  }, [gl, scene, camera]);
  return null;
}

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
  resetKey = 0,
  pipColor,
  holdColor,
  onToggleHold,
  className,
}: DiceSceneProps) {
  const heldSafe = useMemo(
    () => values.map((_, i) => held[i] ?? false),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [values.length, held],
  );

  // iOS/WKWebView drops the WebGL context when the app is backgrounded for a
  // moment. The canvas then stays blank (the dice "disappear") while the
  // invisible hit areas still work. Remount the canvas whenever the context is
  // lost or found lost after returning to the app.
  const [canvasKey, setCanvasKey] = useState(0);
  const glRef = useRef<{ getContext: () => WebGLRenderingContext | null } | null>(null);
  const remount = useCallback(() => setCanvasKey((k) => k + 1), []);

  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== "visible") return;
      const ctx = glRef.current?.getContext?.();
      // `isContextLost` exists on both WebGL1 and WebGL2 contexts.
      if (!ctx || ctx.isContextLost?.()) remount();
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    window.addEventListener("pageshow", check);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
      window.removeEventListener("pageshow", check);
    };
  }, [remount]);

  return (
    <div className={className ?? "h-full w-full"}>

      <Canvas
        key={canvasKey}
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
          glRef.current = gl as unknown as { getContext: () => WebGLRenderingContext | null };
          const canvas = gl.domElement;
          const onLost = (e: Event) => {
            // Preventing the default lets the browser try to restore it, and
            // guarantees a `webglcontextrestored` event.
            e.preventDefault();
            // Remount on the next tick so React is not updated mid-event.
            setTimeout(remount, 0);
          };
          canvas.addEventListener("webglcontextlost", onLost as EventListener);
          canvas.addEventListener("webglcontextrestored", remount);
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
          resetKey={resetKey}
          pipColor={pipColor}
          holdColor={holdColor}
          onToggleHold={onToggleHold}
        />
        <Warmup />
      </Canvas>
    </div>
  );
}

export const DiceScene = memo(DiceSceneImpl);
export default DiceScene;
