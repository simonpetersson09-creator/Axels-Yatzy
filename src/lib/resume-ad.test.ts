import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const home = readFileSync(resolve(__dirname, '../pages/HomePage.tsx'), 'utf8');

// Execute the actual Home lifecycle block with an isolated App bridge; no live analytics.
async function harness() {
  vi.useFakeTimers(); vi.setSystemTime(100_000);
  const window = { location: { pathname: '/' } }; const document = { visibilityState: 'visible' };
  let listener: (state: { isActive: boolean }) => void = () => {};
  const App = { addListener: vi.fn(async (_name, callback) => { listener = callback; }) };
  const show = vi.fn(async (_allowed: () => boolean, _source: string) => false);
  const preload = vi.fn(); const track = vi.fn();
  const block = home.slice(home.indexOf('let startupAdChecked'), home.indexOf("import { shouldShowRatePrompt"))
    .replace("await import('@capacitor/app')", 'await Promise.resolve({ App: bridge })');
  const cleanupMatch = home.match(/useLayoutEffect\((\(\) => \(\) => \{ resumeHomeEpoch\+\+; \}), \[\]\)/);
  if (!cleanupMatch) throw new Error('Home lifecycle cleanup missing');
  const setup = new Function('bridge', 'window', 'document', 'showAppOpenAd', 'preloadAppOpenAd', 'trackEvent',
    `${block}\nreturn { installResumeAdWatcher, leaveHome: (${cleanupMatch[1]})() };`);
  const lifecycle = setup(App, window, document, show, preload, track);
  lifecycle.installResumeAdWatcher(); await vi.advanceTimersByTimeAsync(0);
  return { window, document, show, preload, track, leaveHome: lifecycle.leaveHome,
    state: (isActive: boolean) => listener({ isActive }) };
}
afterEach(() => { vi.useRealTimers(); });
describe('return-away Home lifecycle', () => {
  it('preloads when leaving Home even if visibility is already hidden', async () => {
    const h = await harness(); h.document.visibilityState = 'hidden'; h.state(false);
    expect(h.preload).toHaveBeenCalledExactlyOnceWith('background');
    expect(h.show).not.toHaveBeenCalled();
  });
  it.each(['/game', '/multiplayer-game', '/waiting-room', '/settings', '/admin'])('does not preload when backgrounded from %s', async path => {
    const h = await harness(); h.window.location.pathname = path; h.state(false);
    expect(h.preload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(40_000); h.state(true);
    expect(h.show).not.toHaveBeenCalled();
  });
  it('only preloads on the next departure from Home after an in-game departure', async () => {
    const h = await harness(); h.window.location.pathname = '/game'; h.state(false);
    h.state(true); h.window.location.pathname = '/'; h.state(false);
    expect(h.preload).toHaveBeenCalledExactlyOnceWith('background');
  });
  it.each(['ios', 'android'])('%s cold start never presents over usable Home, including after a late load or remount', async () => {
    const block = home.slice(home.indexOf('    if (startupAdChecked) return;'), home.indexOf('  }, []);', home.indexOf('    if (startupAdChecked) return;')));
    let loaded = false;
    let settle: () => void = () => {};
    const pending = new Promise<void>(resolveLoad => { settle = () => { loaded = true; resolveLoad(); }; });
    const preload = vi.fn(() => pending);
    const show = vi.fn();
    vi.useFakeTimers();
    const setup = new Function('isAdMobAvailable', 'shouldShowDailyStartupAd', 'preloadAppOpenAd', 'showAppOpenAd', 'onStartScreen', 'markDailyStartupAdShown', 'trackEvent',
      `let startupAdChecked = false; const AD_BUTTON_LOCKED = false; return () => { ${block} };`);
    const mount = setup(() => true, () => true, preload, show, () => true, vi.fn(), vi.fn());
    mount();
    expect(preload).toHaveBeenCalledExactlyOnceWith('startup');
    expect(show).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1500);
    expect(show).not.toHaveBeenCalled();
    settle(); await pending;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(loaded).toBe(true);
    expect(show).not.toHaveBeenCalled();
    mount();
    expect(preload).toHaveBeenCalledOnce();
    expect(show).not.toHaveBeenCalled();
  });
  it('retains the 40-second threshold, not 39,999 ms', async () => {
    const h = await harness(); h.state(false); await vi.advanceTimersByTimeAsync(39_999); h.state(true);
    expect(h.show).not.toHaveBeenCalled();
    h.state(false); await vi.advanceTimersByTimeAsync(40_000); h.state(true); await vi.advanceTimersByTimeAsync(0);
    expect(h.show).toHaveBeenCalledOnce(); expect(h.show.mock.calls[0][1]).toBe('resume');
  });
  it('drops returns outside Home and never defers to a later Home visit', async () => {
    const h = await harness(); h.state(false); await vi.advanceTimersByTimeAsync(40_000);
    h.window.location.pathname = '/game'; h.state(true); h.window.location.pathname = '/';
    await vi.advanceTimersByTimeAsync(60_000); h.state(true);
    expect(h.show).not.toHaveBeenCalled(); expect(h.preload).toHaveBeenCalledWith('background');
  });
  it('permanently invalidates an in-flight return when Home unmounts, even after coming back', async () => {
    const h = await harness(); let permitted: () => boolean = () => false;
    h.show.mockImplementation(async allowed => { permitted = allowed; return false; });
    h.state(false); await vi.advanceTimersByTimeAsync(40_000); h.state(true); await vi.advanceTimersByTimeAsync(0);
    expect(permitted()).toBe(true); h.window.location.pathname = '/game'; h.leaveHome();
    h.window.location.pathname = '/'; expect(permitted()).toBe(false);
  });
  it('backgrounding also permanently invalidates the previous return', async () => {
    const h = await harness(); let permitted: () => boolean = () => false;
    h.show.mockImplementation(async allowed => { permitted = allowed; return false; });
    h.state(false); await vi.advanceTimersByTimeAsync(40_000); h.state(true); await vi.advanceTimersByTimeAsync(0);
    expect(permitted()).toBe(true); h.state(false); expect(permitted()).toBe(false);
  });
});
