import { describe, expect, it } from 'vitest';
import { getDiceBodyGeometry } from './body-geometry';

describe('shared dice geometry', () => {
  it('reuses the prepared body for all five dice and subsequent matches', () => {
    const body = getDiceBodyGeometry();
    for (let i = 0; i < 10; i++) expect(getDiceBodyGeometry()).toBe(body);
  });
  it('keeps separate geometry for a different actual die size', () => {
    const normal = getDiceBodyGeometry(1);
    const large = getDiceBodyGeometry(2);
    expect(large).not.toBe(normal);
    large.computeBoundingBox();
    expect(large.boundingBox?.max.x).toBeCloseTo(1, 4);
    expect(large.boundingBox?.min.x).toBeCloseTo(-1, 4);
    expect(getDiceBodyGeometry(2)).toBe(large);
  });
});