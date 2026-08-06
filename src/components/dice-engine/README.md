# 3D Dice Engine (`src/components/dice-engine`)

A self-contained, presentation-only 3D dice renderer. **No game logic lives here.**

## Files

| File                 | Responsibility                                                             |
| -------------------- | -------------------------------------------------------------------------- |
| `DiceScene.tsx`      | Public component. Owns the R3F `<Canvas>`, renderer settings and DPR cap.   |
| `DiceTray.tsx`       | Lighting, environment, contact shadows, responsive camera, dice layout.     |
| `Dice3D.tsx`         | One die: rounded bevelled body + recessed pips, shared geometry/materials.  |
| `useDiceAnimation.ts`| Frame-loop animation driver (no React state while rolling) + reduced motion.|
| `diceRotations.ts`   | Pure math: face quaternions, easing, bounce curve, randomness helpers.      |
| `types.ts`           | `DiceValue`, `DiceConfig`, `DiceSceneProps`.                                |

## API

```tsx
<DiceScene
  values={[6, 2, 5, 1, 3]}      // required, DiceValue[]
  held={[false, true, false, false, true]}
  rolling={rolling}             // flip to true to replay the roll
  onToggleHold={(i) => {}}
  size={1}                      // die edge length (world units)
  spacing={0.35}                // gap between dice
  duration={1.1}                // base roll seconds (varied ±18% per die)
  className="h-full w-full"
/>
```

The scene renders exactly `values.length` dice and never invents a value.

## How the landing is guaranteed

`getFaceQuaternion(value)` gives the orientation that puts the requested face
on +Y. During the roll we post-multiply two decaying axis-angle offsets whose
angles are **whole turns** scaled by `(1 - ease(t))`, so both offsets reach
identity exactly at `t = 1`. Result: believable tumbling, deterministic outcome,
zero physics.

## Copying into another React project

1. Copy the whole `dice-engine` folder into `src/components/`.
2. `npm i three @react-three/fiber @react-three/drei` (+ `-D @types/three`).
3. Render `<DiceScene />` inside a sized container (e.g. `h-64 w-full`).
4. If your host app does SSR (Next.js / TanStack Start), render it client-only:
   `const DiceScene = React.lazy(() => import("@/components/dice-engine/DiceScene"))`
   inside a `<ClientOnly>` / `dynamic(..., { ssr: false })` boundary.

No imports from outside the folder, no Tailwind requirement (the only class is
the overridable default `h-full w-full`), no global state, no context.

## Sizing the dice (integrating into an existing layout)

The camera auto-frames the whole column, so the on-screen size of a die is
decided by two things only:

1. **The container element.** `<DiceScene className="..." />` (or a wrapping
   div with `position: relative`) defines the drawing area. In a narrow side
   rail, give it a fixed width and a height that covers the dice strip, e.g.
   `className="absolute inset-0"` inside a `w-24 h-[420px]` column.
2. **`fill` (0.2–1).** How much of that area the column occupies. `fill={1}`
   = edge to edge, `fill={0.8}` = 20 % margin, i.e. visibly smaller dice.

`size` and `spacing` are world units and mostly change the *relative* gap
between dice, not their pixel size — the framing compensates for `size`.
To make the gaps tighter without shrinking the dice, lower `spacing`.

```tsx
<div className="relative h-[440px] w-24">
  <DiceScene
    className="absolute inset-0"
    values={values}
    held={held}
    rolling={rolling}
    fill={0.86}
    spacing={0.3}
    onToggleHold={toggle}
  />
</div>
```
