import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => vi.resetModules());

describe('pending App Open navigation', () => {
  it('follows a quick tap to setup before a game starts', async () => {
    const m = await import('./app-open-navigation');
    m.setAppOpenPath('/');
    const guard = m.createAppOpenNavigationGuard();
    m.setAppOpenPath('/setup');
    expect(guard()).toBe(true);
  });

  it.each(['/game', '/multiplayer-game'])('cancels after starting %s even on return home', async (path) => {
    const m = await import('./app-open-navigation');
    m.setAppOpenPath('/');
    const guard = m.createAppOpenNavigationGuard();
    m.setAppOpenPath(path);
    expect(guard()).toBe(false);
    m.setAppOpenPath('/');
    expect(guard()).toBe(false);
    expect(m.createAppOpenNavigationGuard()()).toBe(true);
  });

  it('keeps waiting-room navigation protected', async () => {
    const m = await import('./app-open-navigation');
    m.setAppOpenPath('/');
    const guard = m.createAppOpenNavigationGuard();
    m.setAppOpenPath('/waiting-room');
    expect(guard()).toBe(false);
  });
});