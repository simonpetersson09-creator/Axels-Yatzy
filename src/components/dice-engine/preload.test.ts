import { afterEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ prepare: vi.fn() }));
vi.mock('./body-geometry', () => ({ getDiceBodyGeometry: mock.prepare }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it('prepares once during Home idle without creating a canvas', async () => {
  vi.resetModules();
  window.history.replaceState({}, '', '/');
  let idle: (() => void) | undefined;
  vi.stubGlobal('requestIdleCallback', (cb: () => void) => { idle = cb; return 1; });
  const { preloadDiceEngine } = await import('./preload');
  preloadDiceEngine(); preloadDiceEngine();
  expect(mock.prepare).not.toHaveBeenCalled();
  idle?.();
  await vi.waitFor(() => expect(mock.prepare).toHaveBeenCalledTimes(1));
});

it('does not start idle preparation after navigating away from Home', async () => {
  vi.resetModules();
  let idle: (() => void) | undefined;
  vi.stubGlobal('requestIdleCallback', (cb: () => void) => { idle = cb; return 1; });
  const { preloadDiceEngine } = await import('./preload');
  preloadDiceEngine();
  window.history.replaceState({}, '', '/game');
  idle?.();
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(mock.prepare).not.toHaveBeenCalled();
  window.history.replaceState({}, '', '/');
});