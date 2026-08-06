# 3D Dice Engine — Migration Report

Everything transferable lives in `src/components/dice-engine/`. The folder is
self-contained: no imports from the demo page, no design tokens, no shadcn
components, no Tailwind classes, no global CSS, no assets.

## 1. Source files

| File | Destination in target project | Purpose |
| --- | --- | --- |
| `DiceSet.tsx` | `src/components/dice-engine/DiceSet.tsx` | Public API (`DiceSetProps`) |
| `DiceScene.tsx` | `src/components/dice-engine/DiceScene.tsx` | R3F `<Canvas>`, DPR, tone mapping |
| `DiceTray.tsx` | `src/components/dice-engine/DiceTray.tsx` | Camera framing, lighting, column layout |
| `Dice3D.tsx` | `src/components/dice-engine/Dice3D.tsx` | Die mesh, ivory material, pips, tap handling |
| `HoldIndicator.tsx` | `src/components/dice-engine/HoldIndicator.tsx` | Hold/lock ring |
| `useDiceAnimation.ts` | `src/components/dice-engine/useDiceAnimation.ts` | Frame-loop roll animation |
| `diceRotations.ts` | `src/components/dice-engine/diceRotations.ts` | Face quaternions, easing, bounce math |
| `types.ts` | `src/components/dice-engine/types.ts` | `DiceValue`, `DiceConfig`, `DiceSceneProps` |
| `index.ts` | `src/components/dice-engine/index.ts` | Barrel export |
| `README.md` | `src/components/dice-engine/README.md` | Usage notes |

Copy the folder as a unit; all internal imports are relative.

## 2. npm dependencies

```
three@^0.185.1
@react-three/fiber@^9.7.0
@react-three/drei@^10.7.7
```

Dev dependency (TypeScript only): `@types/three@^0.185.3`.

Already assumed present: `react@^19`, `react-dom@^19`, `typescript`.

## 3. Assets

**None.** No GLTF/GLB models, no image textures, no HDRI environment map, no
audio. The die geometry is `RoundedBox` from drei, the pips are generated
procedurally with an in-memory `CanvasTexture`, and all lighting is analytic
(`ambientLight`, `hemisphereLight`, three `directionalLight`s). Nothing needs
to be placed in `public/`.

## 4. Configuration

- **Global CSS:** none required. The engine uses no Tailwind classes and no CSS
  variables. The only inline style is `touchAction: "manipulation"` on the
  canvas.
- **Tailwind config:** no changes. (`className` on `<DiceSet>` is optional and
  passed straight through — style it however the target project wants.)
- **Vite config:** no changes needed for Vite 5+/7+ setups. Do not add
  `ssr.external` entries for `three`.
- **SSR:** WebGL is browser-only. On any SSR framework (TanStack Start,
  Next.js, Remix), load it lazily on the client:
  `const DiceSet = lazy(() => import("@/components/dice-engine/DiceSet"))`
  inside `<ClientOnly>` / a `useEffect`-mounted boundary.
- **Path alias:** the files themselves use only relative imports, so `@/` is
  optional; it only affects how *you* import `DiceSet`.
- **Utility code:** none (`cn`, `clsx`, `tailwind-merge` are not used).

## 5. Public API

```ts
type DiceSetProps = {
  values: [number, number, number, number, number];
  held: [boolean, boolean, boolean, boolean, boolean];
  rolling: boolean;
  onDieClick?: (index: number) => void;
  onRollComplete?: () => void;
};
```

Optional presentation props (all have defaults, safe to ignore):
`size` (1), `spacing` (0.35), `fill` (1, 0.2–1 — how much of the container the
column occupies), `duration` (1.1 s), `className`.

Guarantees:

- The component **never generates game results**. It animates toward exactly
  the numbers in `values` and lands with those faces up.
- `held[i] === true` freezes die `i` — no animation, plus the lock ring.
- Flipping `rolling` to `true` replays the roll for every non-held die;
  `onRollComplete` fires once the animation has settled. The parent decides
  when to set `rolling` back to `false`.
- Values outside 1–6 are clamped; the component renders exactly 5 dice.

## 6. Sizing inside an existing layout

The container decides the area; `fill` decides how large the dice read inside
it. For a narrow vertical column (e.g. 105 × 400 px, ~46 px dice, 76 px pitch):

```tsx
<div className="relative h-[400px] w-[105px]">
  <DiceSet ... spacing={0.652} fill={0.97} className="absolute inset-0" />
</div>
```

---

## Quick checklist

**Files to copy**
- The entire `src/components/dice-engine/` folder (10 files listed above) →
  `src/components/dice-engine/` in the target project.

**Dependencies to install**
```bash
npm i three @react-three/fiber @react-three/drei
npm i -D @types/three
```

**Assets to copy**
- None.

**Configuration changes**
- None to Tailwind, global CSS, or Vite.
- Only requirement: render the component client-side (lazy import / ClientOnly).

**Example usage**

```tsx
import { lazy, Suspense, useState } from "react";

const DiceSet = lazy(() => import("@/components/dice-engine/DiceSet"));

export function DiceColumn() {
  const [values, setValues] = useState<[number, number, number, number, number]>([1, 2, 3, 4, 5]);
  const [held, setHeld] = useState<[boolean, boolean, boolean, boolean, boolean]>([
    false, false, false, false, false,
  ]);
  const [rolling, setRolling] = useState(false);

  const roll = () => {
    // Game logic lives here — never inside the dice engine.
    setValues((prev) =>
      prev.map((v, i) => (held[i] ? v : 1 + Math.floor(Math.random() * 6))) as typeof prev,
    );
    setRolling(true);
  };

  return (
    <div className="relative h-[400px] w-[105px]">
      <Suspense fallback={null}>
        <DiceSet
          values={values}
          held={held}
          rolling={rolling}
          onDieClick={(i) =>
            setHeld((h) => h.map((x, j) => (j === i ? !x : x)) as typeof h)
          }
          onRollComplete={() => setRolling(false)}
          spacing={0.652}
          fill={0.97}
          className="absolute inset-0"
        />
      </Suspense>
      <button onClick={roll}>Roll</button>
    </div>
  );
}
```
