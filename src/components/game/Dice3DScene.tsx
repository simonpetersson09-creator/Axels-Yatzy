import { useMemo, useRef, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { Die3D } from './Die3D';

interface Dice3DSceneProps {
  dice: number[];
  lockedDice: boolean[];
  rollsLeft: number;
  isRolling: boolean;
  onToggleLock: (index: number) => void;
  compact?: boolean;
}

const PX_PER_UNIT = 28;
const DIE_SIZE = 2.0;
const GAP = 26;
const SPACING = (DIE_SIZE * PX_PER_UNIT + GAP) / PX_PER_UNIT;
const CONTAINER_HEIGHT = 5 * DIE_SIZE * PX_PER_UNIT + 4 * GAP;

function AdaptiveCamera() {
  const { camera, size } = useThree();

  useEffect(() => {
    const ortho = camera as THREE.OrthographicCamera;
    const halfWidth = size.width / (2 * PX_PER_UNIT);
    const halfHeight = size.height / (2 * PX_PER_UNIT);
    ortho.left = -halfWidth;
    ortho.right = halfWidth;
    ortho.top = halfHeight;
    ortho.bottom = -halfHeight;
    ortho.near = 0.1;
    ortho.far = 100;
    ortho.updateProjectionMatrix();
  }, [camera, size]);

  return null;
}

export function Dice3DScene({
  dice,
  lockedDice,
  rollsLeft,
  isRolling,
  onToggleLock,
}: Dice3DSceneProps) {
  const hasRolled = rollsLeft < 3;
  const canLock = !isRolling && hasRolled && rollsLeft > 0;
  const initialFaces = useMemo(() => dice.map(() => 1 + Math.floor(Math.random() * 6)), [dice.length]);

  const startY = ((dice.length - 1) * SPACING) / 2;
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      className="relative w-full"
      style={{ height: CONTAINER_HEIGHT, touchAction: 'none' }}
    >
      <Canvas
        dpr={1}
        shadows
        gl={{ alpha: true, antialias: true, preserveDrawingBuffer: false }}
        orthographic
        camera={{ position: [0, 0, 10], zoom: 1 }}
        style={{ background: 'transparent' }}
      >
        <AdaptiveCamera />
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow />
        <pointLight position={[-5, 4, 3]} intensity={0.5} />
        <Environment preset="studio" />
        <ContactShadows
          position={[0, -startY - DIE_SIZE / 2 - 0.1, 0]}
          opacity={0.35}
          scale={10}
          blur={2.5}
          far={12}
          resolution={256}
          frames={Infinity}
        />
        <group>
          {dice.map((value, index) => (
            <Die3D
              key={index}
              value={hasRolled ? value : initialFaces[index]}
              rolling={isRolling && !lockedDice[index]}
              locked={lockedDice[index]}
              canLock={canLock}
              onToggle={() => onToggleLock(index)}
              position={[0, startY - index * SPACING, 0]}
              size={DIE_SIZE}
            />
          ))}
        </group>
      </Canvas>
    </div>
  );
}
