// Real store version of the installed app (e.g. "1.1 (12)"), read from the
// native bundle. Falls back to '1.0.0' on the web / before it resolves.
import { Capacitor } from '@capacitor/core';

let version = '1.0.0';

export const appVersionReady: Promise<string> = (async () => {
  try {
    if (!Capacitor.isNativePlatform()) return version;
    const { App } = await import('@capacitor/app');
    const info = await App.getInfo();
    if (info?.version) version = info.build ? `${info.version} (${info.build})` : info.version;
  } catch { /* keep fallback */ }
  return version;
})();

export function getAppVersion(): string {
  return version;
}
