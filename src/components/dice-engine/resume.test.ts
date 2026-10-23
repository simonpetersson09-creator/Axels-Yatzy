import { beforeEach, describe, expect, it, vi } from 'vitest';
import { subscribeDiceResume } from './resume';

const native = vi.hoisted(() => ({ enabled: false, callback: (_: { isActive: boolean }) => {}, remove: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native.enabled } }));
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn(async (_name, fn) => {
  native.callback = fn;
  return { remove: native.remove };
}) } }));

describe('presentation resume wake', () => {
  beforeEach(() => { native.enabled = false; vi.clearAllMocks(); });
  it('wakes a visible canvas without a prop change and removes listeners', () => {
    const wake = vi.fn();
    const stop = subscribeDiceResume(wake);
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pageshow'));
    expect(wake).toHaveBeenCalledTimes(2);
    stop();
    window.dispatchEvent(new Event('focus'));
    expect(wake).toHaveBeenCalledTimes(2);
  });
  it('wakes on native activation but not on backgrounding', async () => {
    native.enabled = true;
    const wake = vi.fn();
    const stop = subscribeDiceResume(wake);
    await Promise.resolve();
    native.callback({ isActive: false });
    expect(wake).not.toHaveBeenCalled();
    native.callback({ isActive: true });
    expect(wake).toHaveBeenCalledOnce();
    stop();
    expect(native.remove).toHaveBeenCalledOnce();
    native.callback({ isActive: true });
    expect(wake).toHaveBeenCalledOnce();
  });
  it('removes a native listener that resolves after unmount', async () => {
    native.enabled = true;
    const stop = subscribeDiceResume(vi.fn());
    stop();
    await Promise.resolve();
    expect(native.remove).toHaveBeenCalledOnce();
  });
});