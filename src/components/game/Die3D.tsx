import { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';

const PIP_POSITIONS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

const valueToRotation: Record<number, { x: number; y: number }> = {
  1: { x: 0, y: 0 },
  2: { x: 0, y: Math.PI / 2 },
  3: { x: -Math.PI / 2, y: 0 },
  4: { x: Math.PI / 2, y: 0 },
  5: { x: 0, y: -Math.PI / 2 },
  6: { x: 0, y: Math.PI },
};

function createFaceTexture(value: number) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Ivory body with a soft directional gradient.
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#fffefb');
  grad.addColorStop(0.5, '#f8f4ea');
  grad.addColorStop(1, '#e8e0d0');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Deep black pips.
  const positions = PIP_POSITIONS[value];
  const pipR = 22;
  const pad = 38;
  const cell = (size - 2 * pad) / 3;
  ctx.fillStyle = '#000';
  positions.forEach((i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const cx = pad + col * cell + cell / 2;
    const cy = pad + row * cell + cell / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, pipR, 0, Math.PI * 2);
    ctx.fill();
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function minimalDelta(current: number, target: number) {
  const mod = (n: number) => ((n % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI);
  const cur = mod(current);
  const delta = (target - cur + 2 * Math.PI) % (2 * Math.PI);
  return delta;
}

interface Die3DProps {
  value: number;
  rolling: boolean;
  locked: boolean;
  canLock: boolean;
  onToggle: () => void;
  position: [number, number, number];
  size?: number;
}

export function Die3D({ value, rolling, locked, canLock, onToggle, position, size = 2 }: Die3DProps) {
  const groupRef = useRef<THREE.Group>(null);
  const textures = useMemo(() => [1, 2, 3, 4, 5, 6].map((v) => createFaceTexture(v)), []);

  const currentRef = useRef({ x: valueToRotation[value].x, y: valueToRotation[value].y });
  const targetRef = useRef({ x: valueToRotation[value].x, y: valueToRotation[value].y });

  useEffect(() => {
    const base = valueToRotation[value];
    const deltaX = minimalDelta(currentRef.current.x, base.x);
    const deltaY = minimalDelta(currentRef.current.y, base.y);
    targetRef.current = { x: currentRef.current.x + deltaX, y: currentRef.current.y + deltaY };

    if (rolling) {
      const spinsX = (2 + Math.floor(Math.random() * 2)) * 2 * Math.PI;
      const spinsY = (2 + Math.floor(Math.random() * 2)) * 2 * Math.PI;
      targetRef.current.x += spinsX;
      targetRef.current.y += spinsY;
    }
  }, [value, rolling]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const t = 1 - Math.exp(-delta * 5);
    currentRef.current.x += (targetRef.current.x - currentRef.current.x) * t;
    currentRef.current.y += (targetRef.current.y - currentRef.current.y) * t;
    groupRef.current.rotation.x = currentRef.current.x;
    groupRef.current.rotation.y = currentRef.current.y;
  });

  const emissive = locked ? '#f5b942' : '#000000';
  const emissiveIntensity = locked ? 0.45 : 0;

  const init = valueToRotation[value];

  return (
    <group ref={groupRef} position={position} rotation={[init.x, init.y, 0]}>
      <RoundedBox
        args={[size, size, size]}
        radius={size * 0.25}
        smoothness={5}
        castShadow
        receiveShadow
        onPointerDown={canLock ? onToggle : undefined}
      >
        {/* right face -> value 2 */}
        <meshStandardMaterial attach="material-0" map={textures[1]} roughness={0.4} metalness={0.05} emissive={emissive} emissiveIntensity={emissiveIntensity} />
        {/* left face -> value 5 */}
        <meshStandardMaterial attach="material-1" map={textures[4]} roughness={0.4} metalness={0.05} emissive={emissive} emissiveIntensity={emissiveIntensity} />
        {/* top face -> value 3 */}
        <meshStandardMaterial attach="material-2" map={textures[2]} roughness={0.4} metalness={0.05} emissive={emissive} emissiveIntensity={emissiveIntensity} />
        {/* bottom face -> value 4 */}
        <meshStandardMaterial attach="material-3" map={textures[3]} roughness={0.4} metalness={0.05} emissive={emissive} emissiveIntensity={emissiveIntensity} />
        {/* front face -> value 1 */}
        <meshStandardMaterial attach="material-4" map={textures[0]} roughness={0.4} metalness={0.05} emissive={emissive} emissiveIntensity={emissiveIntensity} />
        {/* back face -> value 6 */}
        <meshStandardMaterial attach="material-5" map={textures[5]} roughness={0.4} metalness={0.05} emissive={emissive} emissiveIntensity={emissiveIntensity} />
      </RoundedBox>
    </group>
  );
}
