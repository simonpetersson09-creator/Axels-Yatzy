import { ExtrudeGeometry, Shape } from 'three';
import { toCreasedNormals } from 'three-stdlib';

// Match drei's RoundedBox exactly; build once instead of once per die/mount.
const cache = new Map<number, ExtrudeGeometry>();
export function getDiceBodyGeometry(size = 1): ExtrudeGeometry {
  const cached = cache.get(size);
  if (cached) return cached;
  const eps = 0.00001;
  const radius = size * 0.2;
  const r = radius - eps;
  const shape = new Shape();
  shape.absarc(eps, eps, eps, -Math.PI / 2, -Math.PI, true);
  shape.absarc(eps, size - r * 2, eps, Math.PI, Math.PI / 2, true);
  shape.absarc(size - r * 2, size - r * 2, eps, Math.PI / 2, 0, true);
  shape.absarc(size - r * 2, eps, eps, 0, -Math.PI / 2, true);
  const geometry = new ExtrudeGeometry(shape, {
    depth: size - radius * 2, bevelEnabled: true, bevelSegments: 16,
    steps: 1, bevelSize: radius - eps, bevelThickness: radius, curveSegments: 10,
  });
  geometry.center();
  toCreasedNormals(geometry, 0.5);
  cache.set(size, geometry);
  return geometry;
}