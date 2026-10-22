import { describe, it, expect, beforeEach } from 'vitest';
import { registerLaunch, takeShopPromo } from './shop-promo';

function launches(n: number) {
  const shown: number[] = [];
  for (let i = 1; i <= n; i++) { registerLaunch(); if (takeShopPromo()) shown.push(i); }
  return shown;
}

describe('shop promo', () => {
  beforeEach(() => localStorage.clear());
  it('shows on every 5th launch', () => {
    expect(launches(12)).toEqual([5, 10]);
  });
  it('shows at most 5 times', () => {
    expect(launches(40)).toEqual([5, 10, 15, 20, 25]);
  });
  it('shows only once per launch', () => {
    launches(4); registerLaunch();
    expect(takeShopPromo()).toBe(true);
    expect(takeShopPromo()).toBe(false);
  });
});
